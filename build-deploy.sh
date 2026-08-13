#!/bin/bash
# Deploy script - run this before pushing to production

echo "Building frontend..."
cd halal-crypto-ui
npm install
npm run build
cd ..

echo "✅ Frontend built successfully!"
echo "📁 New files in: halal-crypto-ui/dist/"
echo "🚀 Ready to deploy - backend will serve frontend from dist/"
