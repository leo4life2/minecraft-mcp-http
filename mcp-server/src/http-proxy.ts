#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import { program } from 'commander';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
program
    .option('--http-port <port>', 'HTTP server port (default: 3000)', '3000')
    .option('--mc-host <host>', 'Default Minecraft server host')
    .option('--mc-port <port>', 'Default Minecraft server port')
    .parse(process.argv);

const options = program.opts();

class MCPProxy {
    private mcpProcess: ChildProcess | null = null;
    private messageId = 1;
    private pendingRequests: Map<number, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
    private buffer = '';

    async start() {
        console.error('[PROXY] Starting MCP server process...');
        
        // Build the command to start the MCP server
        const mcpServerPath = join(__dirname, 'mcp-server.js');
        const args = [];
        
        if (options.mcHost) {
            args.push('--host', options.mcHost);
        }
        if (options.mcPort) {
            args.push('--port', options.mcPort);
        }

        console.error(`[PROXY] Spawning: node ${mcpServerPath} ${args.join(' ')}`);

        // Spawn the MCP server process
        this.mcpProcess = spawn('node', [mcpServerPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        if (!this.mcpProcess.stdin || !this.mcpProcess.stdout || !this.mcpProcess.stderr) {
            throw new Error('Failed to create MCP server process with proper stdio');
        }

        // Handle MCP server output
        this.mcpProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.error(`[PROXY] Raw stdout from MCP server: ${JSON.stringify(output)}`);
            
            // Add to buffer
            this.buffer += output;
            console.error(`[PROXY] Buffer now contains: ${this.buffer.length} characters`);
            
            // Try to extract complete JSON messages from buffer
            this.processBuffer();
        });

        // Handle MCP server errors
        this.mcpProcess.stderr.on('data', (data) => {
            console.error('[MCP]', data.toString().trim());
        });

        // Handle process exit
        this.mcpProcess.on('exit', (code) => {
            console.error(`[PROXY] MCP server process exited with code ${code}`);
            this.mcpProcess = null;
        });

        console.error('[PROXY] MCP server process started');
    }

    private processBuffer() {
        // Try to find complete JSON messages in the buffer
        let startIndex = 0;
        
        while (startIndex < this.buffer.length) {
            // Look for the start of a JSON message
            const openBrace = this.buffer.indexOf('{', startIndex);
            if (openBrace === -1) {
                // No more JSON objects in buffer
                break;
            }
            
            // Find the matching closing brace
            let braceCount = 0;
            let endIndex = -1;
            
            for (let i = openBrace; i < this.buffer.length; i++) {
                if (this.buffer[i] === '{') {
                    braceCount++;
                } else if (this.buffer[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }
            
            if (endIndex === -1) {
                // Incomplete JSON message, wait for more data
                console.error(`[PROXY] Incomplete JSON message in buffer, waiting for more data`);
                break;
            }
            
            // Extract the complete JSON message
            const jsonStr = this.buffer.substring(openBrace, endIndex + 1);
            console.error(`[PROXY] Extracted complete JSON: ${jsonStr.substring(0, 100)}...`);
            
            try {
                const message = JSON.parse(jsonStr);
                console.error(`[PROXY] Successfully parsed JSON message with id: ${message.id}`);
                this.handleMCPResponse(message);
            } catch (e) {
                console.error('[PROXY] Failed to parse extracted JSON:', e);
                console.error('[PROXY] JSON was:', jsonStr.substring(0, 200));
            }
            
            // Move past this message
            startIndex = endIndex + 1;
        }
        
        // Remove processed data from buffer
        if (startIndex > 0) {
            this.buffer = this.buffer.substring(startIndex);
            console.error(`[PROXY] Buffer trimmed to ${this.buffer.length} characters`);
        }
    }

    private handleMCPResponse(message: any) {
        console.error(`[PROXY] Handling MCP response with ID: ${message.id}`);
        console.error(`[PROXY] Current pending requests: ${Array.from(this.pendingRequests.keys()).join(', ')}`);
        
        if (message.id && this.pendingRequests.has(message.id)) {
            console.error(`[PROXY] Found matching request for ID: ${message.id}`);
            const request = this.pendingRequests.get(message.id)!;
            clearTimeout(request.timeout);
            this.pendingRequests.delete(message.id);
            request.resolve(message);
        } else {
            console.error(`[PROXY] No matching request found for message ID: ${message.id}`);
            console.error(`[PROXY] Message was:`, JSON.stringify(message, null, 2));
        }
    }

    async sendRequest(method: string, params?: any): Promise<any> {
        if (!this.mcpProcess || !this.mcpProcess.stdin) {
            throw new Error('MCP server process not running');
        }

        const id = this.messageId++;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            ...(params && { params })
        };

        console.error(`[PROXY] Sending request to MCP server:`, JSON.stringify(request, null, 2));

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error(`[PROXY] Request ${id} timed out`);
                this.pendingRequests.delete(id);
                reject(new Error('Request timeout'));
            }, 30000);

            this.pendingRequests.set(id, { resolve, reject, timeout });
            console.error(`[PROXY] Added request ${id} to pending requests`);

            try {
                const requestStr = JSON.stringify(request) + '\n';
                console.error(`[PROXY] Writing to MCP server stdin: ${JSON.stringify(requestStr)}`);
                this.mcpProcess!.stdin!.write(requestStr);
            } catch (error) {
                console.error(`[PROXY] Error writing to MCP server stdin:`, error);
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                reject(error);
            }
        });
    }

    async stop() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
            this.mcpProcess = null;
        }
        
        // Reject all pending requests
        for (const [id, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error('Server shutting down'));
        }
        this.pendingRequests.clear();
    }
}

async function main() {
    const httpPort = parseInt(options.httpPort);
    const proxy = new MCPProxy();

    // Start the MCP server
    await proxy.start();

    // Create Express app
    const app = express();

    // Enable CORS
    app.use(cors({
        origin: true,
        credentials: true
    }));

    // Parse JSON bodies
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            transport: 'http-proxy',
            timestamp: new Date().toISOString(),
            mcpProcess: proxy['mcpProcess'] !== null
        });
    });

    // MCP endpoint - handle POST requests
    app.post('/mcp', async (req, res) => {
        try {
            // Validate Origin header for security
            const origin = req.get('Origin');
            
            const message = req.body;
            console.error(`[PROXY] Received HTTP request:`, JSON.stringify(message, null, 2));

            // Set CORS headers
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');

            // Special handling for initialize method
            if (message.method === 'initialize') {
                // Forward the initialize request to MCP server
                const initResponse = await proxy.sendRequest(message.method, message.params);
                
                // Also get the tools list to enhance capabilities
                const toolsResponse = await proxy.sendRequest('tools/list');
                
                // Enhance the capabilities with actual tools info
                if (initResponse.result && initResponse.result.capabilities && toolsResponse.result && toolsResponse.result.tools) {
                    initResponse.result.capabilities.tools = {
                        available: toolsResponse.result.tools.length,
                        listSupported: true
                    };
                    console.error(`[PROXY] Enhanced capabilities with ${toolsResponse.result.tools.length} tools`);
                }
                
                console.error(`[PROXY] Sending enhanced HTTP response:`, JSON.stringify(initResponse, null, 2));
                res.json({
                    ...initResponse,
                    id: message.id // Use the original request ID
                });
            } else {
                // Forward other requests normally
                const response = await proxy.sendRequest(message.method, message.params);
                console.error(`[PROXY] Sending HTTP response:`, JSON.stringify(response, null, 2));
                
                res.json({
                    ...response,
                    id: message.id // Use the original request ID
                });
            }
        } catch (error) {
            console.error(`[PROXY] Error handling request:`, error);
            res.status(500).json({
                jsonrpc: '2.0',
                id: req.body?.id || null,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error instanceof Error ? error.message : String(error)
                }
            });
        }
    });

    // Handle OPTIONS requests for CORS
    app.options('/mcp', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
        res.status(200).end();
    });

    // Start HTTP server
    app.listen(httpPort, '0.0.0.0', () => {
        console.error(`[PROXY] HTTP server running on http://0.0.0.0:${httpPort}`);
        console.error(`[PROXY] MCP endpoint: http://0.0.0.0:${httpPort}/mcp`);
        console.error(`[PROXY] Health check: http://0.0.0.0:${httpPort}/health`);
        console.error(`[PROXY] Example usage:`);
        console.error(`  curl -X POST http://0.0.0.0:${httpPort}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`);
    });

    // Handle shutdown gracefully
    const shutdown = async () => {
        console.error('[PROXY] Shutting down...');
        await proxy.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    console.error('[PROXY] Failed to start:', error);
    process.exit(1);
}); 