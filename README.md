# Fundamental Labs/Minecraft Client

This library is the Client library for a Minecraft Game Skills and MCP Integration.

Fairies MCP Client (<https://fairies.ai/>) also supports direct connection with a single click.

<a href="https://glama.ai/mcp/servers/@leo4life2/minecraft-mcp-http">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@leo4life2/minecraft-mcp-http/badge" alt="Minecraft Server MCP server" />
</a>

## Features

- **Full Minecraft Control**: Connect AI agents to Minecraft servers and control bots
- **30 Verified Skills**: Pre-built, tested skills for common Minecraft tasks
- **Flexible Connection**: Connect to any Minecraft server with optional per-bot configuration
- **Multi-Bot Support**: Manage multiple bots simultaneously
- **MCP Standard**: Compatible with any MCP client (Claude Desktop, etc.)

## Installation

### Direct call via npx (Recommended)

```bash
npx --y -- @fundamentallabs/minecraft-mcp
```

### Via npm (Recommended)

```bash
npm install -g @fundamentallabs/minecraft-mcp
```

### From Source

```bash
git clone https://github.com/FundamentalLabs/minecraft-mcp.git
cd minecraft-mcp/minecraft-client/mcp-server
npm install
npm run build
```

## Usage

### Starting the Server

You can start the MCP server with optional default connection settings:

```bash
# Start with no defaults (connection specified per bot)
minecraft-mcp

# Start with default connection settings
minecraft-mcp -h play.example.com -p 25565
```

### Command Line Options

```bash
Options:
  -p, --port <port>  Minecraft server port (default: 25565)
  -h, --host <host>  Minecraft server host (default: localhost)
  --help            Display help
```

### Integration with Claude Desktop or JSON configurations Locally

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

For remote installation (recommended)

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "npx",
      "args": ["-y", "-- @fundamentallabs/minecraft-mcp"]
    }
  }
}
```

If running locally from source:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["/path/to/minecraft-mcp/minecraft-client/mcp-server/dist/mcp-server.js"]
    }
  }
}
```

Replace `/path/to/minecraft-mcp` with the actual path where you cloned the repository.

### Integration with Other MCP Clients

The server uses stdio transport and can be integrated with any MCP client:

```bash
# Using the MCP inspector for testing
cd minecraft-client/mcp-server
npx @modelcontextprotocol/inspector node dist/mcp-server.js -- -p 25565
```

## Available Skills

### Bot Management

- **joinGame** - Spawn a new bot into the Minecraft game
  - `username` (required): Bot's username
  - `host` (optional): Server host (defaults to 'localhost' or command line option)
  - `port` (optional): Server port (defaults to 25565 or command line option)

- **leaveGame** - Disconnect bot(s) from the game
  - `username` (optional): Specific bot to disconnect
  - `disconnectAll` (optional): Disconnect all bots if true

### Movement & Navigation

- **goToSomeone** - Navigate to another player
- **goToKnownLocation** - Navigate to specific coordinates
- **runAway** - Run away from threats
- **swimToLand** - Swim to nearest land when in water

### Combat & Hunting

- **attackSomeone** - Attack players, mobs, or animals
- **hunt** - Hunt animals or mobs

### Resource Gathering

- **mineResource** - Mine specific blocks or resources
- **harvestMatureCrops** - Harvest mature crops from farmland
- **pickupItem** - Pick up items from the ground

### Crafting & Smelting

- **craftItems** - Craft items using a crafting table
- **cookItem** - Cook items in a furnace
- **smeltItem** - Smelt items in a furnace
- **retrieveItemsFromNearbyFurnace** - Get smelted items from furnace

### Inventory Management

- **openInventory** - Open the bot's inventory
- **equipItem** - Equip armor, tools, or weapons
- **dropItem** - Drop items from inventory
- **giveItemToSomeone** - Give items to another player

### Building & Farming

- **placeItemNearYou** - Place blocks near the bot
- **prepareLandForFarming** - Prepare land for farming
- **useItemOnBlockOrEntity** - Use items on blocks or entities

### Survival

- **eatFood** - Eat food to restore hunger
- **rest** - Rest to regain health
- **sleepInNearbyBed** - Find and sleep in a bed

### Storage

- **openNearbyChest** - Open a nearby chest

### Fun

- **dance** - Make the bot dance

### Vision

- **lookAround** - Look around and observe the environment

### Communication

- **readChat** - Read recent chat messages from the server
- **sendChat** - Send chat messages or commands to the server

### Building

- **buildSomething** - Build structures using Minecraft commands (requires cheats/operator permissions). Supports both static command arrays and dynamic JavaScript code.
- **buildPixelArt** - Build pixel art from an image in Minecraft (requires cheats/operator permissions). Converts an image to pixel art using colored blocks. Maximum size is 256x256 blocks.

## API Example

When integrated with an MCP client, you can control the bot like this:

```javascript
// First, spawn a bot
await client.callTool('joinGame', { username: 'MyBot' });

// Make the bot mine some wood
await client.callTool('mineResource', { name: 'oak_log', count: 10 });

// Craft wooden planks
await client.callTool('craftItems', { item: 'oak_planks', count: 40 });

// Navigate to coordinates
await client.callTool('goToKnownLocation', { x: 100, y: 64, z: 200 });

// Build a structure using commands (requires cheats) - Script mode
await client.callTool('buildSomething', {
  buildScript: [
    { command: "fill", x1: 0, y1: 64, z1: 0, x2: 10, y2: 64, z2: 10, block: "stone" },
    { command: "fill", x1: 1, y1: 65, z1: 1, x2: 9, y2: 68, z2: 9, block: "oak_planks" },
    { command: "setblock", x: 5, y: 65, z: 1, block: "oak_door" }
  ]
});

// Build dynamically with JavaScript (requires cheats) - Code mode
await client.callTool('buildSomething', {
  code: `
    // Build a pyramid centered on the bot
    const size = 10;
    for (let y = 0; y < size; y++) {
      const level = size - y;
      fill(pos.x - level, pos.y + y, pos.z - level,
           pos.x + level, pos.y + y, pos.z + level, 'sandstone');
      await wait(5); // Small delay between levels
    }
    log('Pyramid complete!');
  `
});

// Build pixel art from an image (requires cheats)
await client.callTool('buildPixelArt', {
  imagePath: 'https://example.com/logo.png',
  width: 64,
  height: 64,
  x: 0,
  y: 80,
  z: 100,
  facing: 'north'
});

// Read recent chat messages
await client.callTool('readChat', {
  count: 30,
  timeLimit: 300,  // Last 5 minutes
  filterType: 'chat'  // Only player messages
});

// Send a chat message
await client.callTool('sendChat', {
  message: 'Hello everyone! I am a bot.'
});

// Send a command
await client.callTool('sendChat', {
  message: '/time set day'
});

// Send a whisper
await client.callTool('sendChat', {
  message: '/msg Steve I can help you build!',
  delay: 1000  // Wait 1 second before sending
});
```

## Architecture

The MCP server:

- Uses stdio transport for communication with AI clients
- Dynamically loads skills from the verified skills directory
- Manages multiple bot instances (currently uses the first bot for all operations)
- Provides a unified interface for all bot actions

## Requirements

- Node.js >= 18.0.0
- A Minecraft server (Java Edition) to connect to
- An MCP-compatible client (like Claude Desktop)

## Troubleshooting

### "Skill implementation not found" Error

The MCP server needs to be run from the cloned repository with built skills. Make sure you:

1. Cloned the full repository
2. Ran `npm install` in the minecraft-client directory
3. Ran `npm run build` in the minecraft-client directory
4. Are running the MCP server from the correct directory

### Bot won't connect

- Ensure your Minecraft server is running and accessible
- Check that the port and host are correct
- Verify the server allows the Minecraft version the bot uses

### Skills not working

- Make sure the bot has spawned successfully before using skills
- Some skills require specific items or conditions
- Check the bot's console output for error messages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT - see LICENSE file for details

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/FundamentalLabs/minecraft-mcp/issues).

### Testing

To test with the Anthropic MPC inspector

'npx @modelcontextprotocol/inspector node ./dist/mcp-server.js'