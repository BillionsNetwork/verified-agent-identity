name: Verify Human Identity

on:
  workflow_dispatch:
    inputs:
      agent_name:
        description: 'finder'
        required: true
        default: 'finder'
      agent_description:
        description: 'finder'
        required: true
        default: 'finder AI Agent'

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Step 1 - Install ClawHub skill
        run: npx clawhub@latest install verified-agent-identity

      - name: Install script dependencies
        run: |
          cd scripts
          npm install

      - name: Step 2 - Create new Ethereum Identity
        run: node scripts/createNewEthereumIdentity.js

      - name: Step 3 - Link Human to Agent
        run: |
          node scripts/manualLinkHumanToAgent.js --challenge '{"name": "finder", "description": "finder AI Agent"}'
