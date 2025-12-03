export const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VRChat Status - Modern Light Theme</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :root {
      --primary-color: #0e9bb1;
      --bg-color: #f8f9fa;
      --card-bg: #ffffff;
      --text-primary: #333333;
      --text-secondary: #666666;
      --border-color: #e0e0e0;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    body {
      margin: 0;
      padding: 2rem;
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }

    header {
      margin-bottom: 2rem;
      text-align: center;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
      justify-content: center;
    }

    .status-badge {
      background-color: #4caf50;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .last-updated {
      margin-top: 0.5rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    main {
      width: 100%;
      max-width: 1200px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .card {
      background-color: var(--card-bg);
      border-radius: 1rem;
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: 1px solid var(--border-color);
    }

    .card-header {
      padding: 1.5rem 1.5rem 1rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .card-body {
      padding: 1.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #fafafa;
    }

    .chart-container {
      width: 100%;
      overflow-x: auto;
    }

    /* SVG Override Styles for Light Theme */
    svg {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      display: block;
    }
    
    /* Force light theme styles into SVGs */
    svg rect[fill="#0E1013"] {
      fill: transparent; /* Remove dark background */
    }
    
    svg .axis, svg .grid {
      stroke: #e0e0e0 !important;
    }
    
    svg .label {
      fill: #666666 !important;
      font-family: 'Inter', sans-serif !important;
    }
    
    svg .title {
      display: none; /* Hide SVG internal title as we use card title */
    }
    
    svg .line {
      stroke: var(--primary-color) !important;
      stroke-width: 2 !important;
      fill: none !important;
    }
    
    svg .area {
      fill: url(#gradient-primary) !important;
      fill-opacity: 1 !important;
    }

    footer {
      margin-top: 3rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-align: center;
    }

    @media (min-width: 768px) {
      main {
        grid-template-columns: repeat(2, 1fr);
      }
      .card.full-width {
        grid-column: span 2;
      }
    }
  </style>
</head>
<body>
  <svg width="0" height="0" style="position: absolute; opacity: 0;">
    <defs>
      <linearGradient id="gradient-primary" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#0e9bb1" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#0e9bb1" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
  </svg>
  <header>
    <h1>
      VRChat System Status
      <span class="status-badge">Operational</span>
    </h1>
    <div class="last-updated">Last Updated: UTC <span id="timestamp-utc">{{time-utc}}</span> • Beijing <span id="timestamp-bj">{{time-beijing}}</span></div>
  </header>

  <main>
    <!-- Online Users Card (Full Width) -->
    <div class="card full-width">
      <div class="card-header">
        <h2 class="card-title">Online Users</h2>
        <span class="metric-value" id="ccu-value">{{ccu}}</span>
      </div>
      <div class="card-body">
        <div class="chart-container" id="chart-users">
          {{chart-users}}
        </div>
      </div>
    </div>

    <!-- API Latency -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">API Latency</h2>
        <span class="metric-value">Normal</span>
      </div>
      <div class="card-body">
        <div class="chart-container" id="chart-latency">
          {{chart-latency}}
        </div>
      </div>
    </div>

    <!-- API Requests -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">API Requests</h2>
        <span class="metric-value">High</span>
      </div>
      <div class="card-body">
        <div class="chart-container" id="chart-requests">
          {{chart-requests}}
        </div>
      </div>
    </div>
  </main>

  <footer>
    Generated by koishi-plugin-vrchat-status v{{version}} • Data source: status.vrchat.com
    <br>
    <br>
    GitHub Repo: https://github.com/WavesMan/koishi-plugin-vrchat-status
  </footer>
</body>
</html>
`
