# Use Node.js 20\nFROM node:20\n\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm install --production\n\nCOPY . .\n\nEXPOSE 5000\n\nCMD ["node","src/worker.js"]
