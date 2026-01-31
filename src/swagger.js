const swaggerJSDoc = require("swagger-jsdoc");
const glob = require("glob");
const path = require("path");

// Automatically get all JS files in project except node_modules
const apiFiles = glob.sync(path.join(__dirname, "../**/*.js"), {
  ignore: ["**/node_modules/**", "**/docs/**", "**/migrations/**", "**/db/**", "**/agent/**", "**/patches/**"] // ignore node_modules and docs folder
});

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "Backend API documentation",
    },
    servers: [{ url: "http://localhost:3000" }],
  },
  apis: apiFiles,
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
