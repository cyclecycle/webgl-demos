# WebGL ExperimentsA collection of interactive WebGL experiments built with Three.js.## Experiments1.  **[Stalker Unit PoC](/stalker-poc/)**: A controllable unit with procedural IK leg animation.2.  **[Citation Analysis Visualization](/citation-viz/)**: Interactive 3D visualization of paper citations and network connections.3.  **[SC2-Style Pathfinding](/sc2-pathfinding/)**: RTS unit movement with A* pathfinding, string pulling, and steering behaviors.## Local DevelopmentYou can run the project locally using either Python or Node.js.### Option 1: Python (Built-in)```bashpython3 start_server.py```Open [http://localhost:8000](http://localhost:8000)### Option 2: Node.js```bashnpm installnpm start```Open the URL shown in the terminal (usually port 3000 or defined by $PORT).
## Deployment

This project is ready to be deployed as a static site or a simple Node.js web service.

### Deploy on Render (Recommended)

This project includes a `render.yaml` blueprint for easy deployment.

1.  Push this repository to GitHub or GitLab.
2.  Log in to [Render](https://render.com).
3.  Click **New +** and select **Blueprint**.
4.  Connect your repository.
5.  Render will automatically detect the `render.yaml` configuration.
6.  Click **Apply** to deploy.

### Manual Deployment

If you prefer to set up the service manually:

1.  Create a new **Web Service** on Render.
2.  Connect your repository.
3.  Set the following:
    -   **Build Command**: `npm install`
    -   **Start Command**: `npm start`
4.  Click **Create Web Service**.

### Other Static Hosts (Vercel, Netlify, GitHub Pages)

Since this project consists of static files (HTML/JS/CSS), you can deploy it anywhere.
Just ensure the build directory is the root (`.`) or configure the host to serve the root directory.
