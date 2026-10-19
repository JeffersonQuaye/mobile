# MoMoGuard

MoMoGuard is a mobile-money security app built with only a React Native client and a Python Flask API. The project has no browser prototype and no separate frontend repository.

## Project structure

- `backend/app.py`: Flask API with authentication, dashboard, transactions, alerts, security settings, fraud scoring, profile, and assistant routes.
- `backend/requirements.txt`: Python dependencies.
- `mobile/App.js`: React Native application and screens.
- `mobile/package.json`: Expo project configuration.

## Run the Flask API

From the project root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\app.py
```

The API runs at `http://127.0.0.1:5000`. Check it at `http://127.0.0.1:5000/api/health`.

The local API uses in-memory data, so PostgreSQL is not required to run the demo.

Demo account:

```text
Email: jefferson@example.com
Password: DemoPass123!
```

## Run the React Native app

Open a second terminal:

```powershell
cd mobile
npm install
npm start
```

Then choose an Expo target:

```powershell
npm run android
npm run ios
npm run web
```

For an Android emulator, the default API address is `http://10.0.2.2:5000/api`. For a physical phone, create `mobile/.env` with the computer's LAN address:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:5000/api
```

Keep the Flask terminal running while using the mobile app.

## Current scope

This rebuild is a complete local prototype. It intentionally keeps data in memory so the client and API can be run immediately. Before production use, replace the in-memory store with PostgreSQL, move tokens to a secure production session strategy, add rate limiting, and replace the baseline fraud rules with a validated model.
