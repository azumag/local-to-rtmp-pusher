#!/bin/bash

# Install Puppeteer MCP Server
echo "Installing Puppeteer MCP Server..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Create MCP directory if it doesn't exist
mkdir -p ~/mcp-servers

# Navigate to MCP directory
cd ~/mcp-servers

# Clone or install puppeteer MCP
echo "Installing @modelcontextprotocol/server-puppeteer..."
npm install -g @modelcontextprotocol/server-puppeteer

echo "Puppeteer MCP Server installed successfully!"
echo ""
echo "To use it with Claude, add the following to your Claude desktop configuration:"
echo ""
echo '{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}'