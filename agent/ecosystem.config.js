module.exports = {
  apps: [
    {
      name: 'talktivity-node-server',
      script: 'server.js',
      cwd: '/home/ubuntu/Talktivity/AgentServer',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        API_PORT: 8082
      },
      error_file: '/home/ubuntu/Talktivity/AgentServer/logs/node-error.log',
      out_file: '/home/ubuntu/Talktivity/AgentServer/logs/node-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
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
    },
    {
      name: 'python-agent',
      script: 'minimal_assistant.py',
      interpreter: '.venv/bin/python',
      args: 'start',
      cwd: '/home/ubuntu/Talktivity/AgentServer/agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        API_URL: 'http://localhost:8082'
      },
      error_file: '/home/ubuntu/Talktivity/AgentServer/agent/logs/agent-error.log',
      out_file: '/home/ubuntu/Talktivity/AgentServer/agent/logs/agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};

