#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# deploy.sh — Automated Cloud Run deployment for BoardyBoo
# Usage:  ./deploy.sh [--project PROJECT_ID] [--region REGION]
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
BACKEND_SERVICE="boardyboo-backend"
FRONTEND_SERVICE="boardyboo-frontend"

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_ID="$2"; shift 2 ;;
    --region)  REGION="$2";  shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: Set GOOGLE_CLOUD_PROJECT env var or pass --project PROJECT_ID"
  exit 1
fi

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  BoardyBoo — Cloud Run Deployment                       ║"
echo "║  Project : $PROJECT_ID"
echo "║  Region  : $REGION"
echo "╚═══════════════════════════════════════════════════════════╝"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo "→ Enabling Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  calendar-json.googleapis.com \
  gmail.googleapis.com \
  generativelanguage.googleapis.com \
  --project "$PROJECT_ID" --quiet

# ── 1. Deploy Backend ────────────────────────────────────────────────────────
echo ""
echo "━━━ Building & deploying backend ━━━"
gcloud run deploy "$BACKEND_SERVICE" \
  --source ./Backend \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --session-affinity \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,FIREBASE_SERVICE_ACCOUNT_PATH=/app/boardyboo-d6d82-firebase-adminsdk-fbsvc-c0cbac08cd.json,FIREBASE_PROJECT_ID=boardyboo-d6d82" \
  --quiet

BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format 'value(status.url)')

echo "✓ Backend deployed: $BACKEND_URL"

# ── 2. Deploy Frontend ───────────────────────────────────────────────────────
echo ""
echo "━━━ Building & deploying frontend ━━━"

# Derive WebSocket URL (wss:// version of the backend)
WS_URL=$(echo "$BACKEND_URL" | sed 's|^https://|wss://|')

gcloud run deploy "$FRONTEND_SERVICE" \
  --source ./frontend \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "NODE_ENV=production" \
  --set-build-env-vars "NEXT_PUBLIC_API_URL=$BACKEND_URL,NEXT_PUBLIC_WS_URL=$WS_URL,NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAG3r2zinXcr4xjwWr8crrQPMSZb3_lfMo,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=boardyboo-d6d82.firebaseapp.com,NEXT_PUBLIC_FIREBASE_PROJECT_ID=boardyboo-d6d82,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=boardyboo-d6d82.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=348284926729,NEXT_PUBLIC_FIREBASE_APP_ID=1:348284926729:web:a5ed70fdd558a3312a71d8" \
  --quiet

FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format 'value(status.url)')

echo "✓ Frontend deployed: $FRONTEND_URL"

# ── 3. Update backend CORS to allow frontend origin ──────────────────────────
echo ""
echo "━━━ Updating backend CORS origins ━━━"
gcloud run services update "$BACKEND_SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "CORS_ORIGINS=[\"$FRONTEND_URL\",\"http://localhost:3000\"]" \
  --quiet

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Deployment complete!                                    ║"
echo "║                                                          ║"
echo "║  Frontend : $FRONTEND_URL"
echo "║  Backend  : $BACKEND_URL"
echo "║  Health   : $BACKEND_URL/health"
echo "╚═══════════════════════════════════════════════════════════╝"