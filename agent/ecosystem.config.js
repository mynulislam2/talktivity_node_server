module.exports = {
  apps: [
    {
      name: 'talktivity-api-server',
      script: 'api_server.py',
      interpreter: '.venv/bin/python',
      cwd: '/home/ubuntu/Talktivity/AgentServer/agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8090
      },
      error_file: '/home/ubuntu/Talktivity/AgentServer/agent/logs/api-error.log',
      out_file: '/home/ubuntu/Talktivity/AgentServer/agent/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};

