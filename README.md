# Smoke Show Golf 🏌️

**The coach you need to smoke your drive.**

An AI-powered golf swing analyzer that provides instant feedback and personalized training plans.

## Features

- **Video Upload** - Upload a video of your golf swing (MP4, MOV, WebM)
- **AI Analysis** - Powered by Google Gemini for comprehensive swing analysis
- **Detailed Feedback** - Get insights on posture, grip, backswing, impact, and follow-through
- **Training Plans** - Personalized 4-week training plans with drills for the driving range
- **Video Recommendations** - Curated YouTube tutorials based on your specific needs

## Getting Started

### Prerequisites

- Node.js 18+
- A Google AI Studio API key ([Get one here](https://aistudio.google.com/))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bmvibe/smoke-show-swing.git
cd smoke-show-swing
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Add your Gemini API key to `.env.local`:
```
GEMINI_API_KEY=your_api_key_here
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bmvibe/smoke-show-swing&env=GEMINI_API_KEY)

1. Click the button above or import the repo to Vercel
2. Add your `GEMINI_API_KEY` environment variable
3. Deploy!

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **AI**: Google Gemini 2.0 Flash
- **Deployment**: Vercel

## Tips for Best Results

- Film from directly behind or face-on
- Use good lighting (natural daylight works best)
- Keep full body and club visible
- Trim video to under 30 seconds
- Include setup, swing, and follow-through

## License

MIT
