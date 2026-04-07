# 🥎 10U Softball Coach Assistant — Quick Start

## First-Time Setup (do once)

1. **Install Node.js** if you don't have it: https://nodejs.org (download the LTS version)

2. **Open a terminal** in the `app` folder:
   - Windows: Right-click the `app` folder → "Open in Terminal" (or PowerShell)

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Create your `.env` file:**
   - Copy `.env.example` and rename the copy to `.env`
   - Open `.env` and replace `your_api_key_here` with your Anthropic API key
   - Get a key at: https://console.anthropic.com/

## Running the App

Each time you want to use it:

```
npm start
```

Then open your browser to: **http://localhost:3000**

The app works on your phone too — just make sure your phone is on the same WiFi,
then open: **http://[your-computer-ip]:3000**

(Find your computer's IP in Settings → Network, or type `ipconfig` in terminal)

## Features

| Tab | What it does |
|-----|-------------|
| 📋 Practice Plan | Generate a full practice plan — pick location, duration, focus |
| 💬 Ask Coach | Chat with your AI coaching assistant |
| 📅 Season Phase | See what phase you're in and what to focus on |
| 🔍 Research | Deep-dive any skill — get drills, cues, and Megrem YouTube searches |

## Tips

- The app automatically knows what season phase you're in based on today's date
- Practice plans can be printed directly from the app (Print button)
- Chat history is saved within a session but resets when you refresh
- For best results on the Practice Plan, be specific in the "Additional Notes" field

## Docker / NAS Deployment

To run the app 24/7 on a Synology NAS (or any Docker host):

1. **Copy the `app/` folder** to the NAS (e.g., `/volume1/docker/softball-coach/`)

2. **Create a `.env` file** on the NAS with your secrets:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   ```

3. **Build and start** (SSH into the NAS):
   ```
   cd /volume1/docker/softball-coach
   docker-compose up -d --build
   ```

4. **Access the app** from any device on the network:
   ```
   http://192.168.68.132:3080
   ```

**Useful commands:**
- View logs: `docker-compose logs -f softball-coach`
- Restart: `docker-compose restart`
- Rebuild after code changes: `docker-compose up -d --build`
- Stop: `docker-compose down`

## Troubleshooting

- **"Cannot find module '@anthropic-ai/sdk'"** → Run `npm install` in the app folder
- **"ANTHROPIC_API_KEY is not set"** → Make sure your `.env` file exists with your key
- **Port already in use** → Change PORT in `.env` to another number like `3001`
