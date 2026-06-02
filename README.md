# dub_eval

## Setup

1) Backend

- Change to the backend folder and install Python deps:

```bash
cd backend
pip install -r requirements.txt
```

- Install FFmpeg (Windows):

```powershell
winget install Gyan.FFmpeg
```

- Download SyncNet model into `backend/syncnet_python`:

```bash
git clone https://github.com/joonson/syncnet_python.git
cd syncnet_python
# Ensure download_model.sh has LF line endings 
bash download_model.sh
```

* Run the backend API (example using Uvicorn):

```bash
uvicorn app:app --reload
```

4) Frontend

- Change to the frontend folder and install Node deps:

```bash
cd frontend
npm install
# start the dev server (Vite):
npm run dev
```
