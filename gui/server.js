const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate-config', (req, res) => {
  const config = req.body;
  
  const generatedConfig = generateConfigString(config);
  res.json({ config: generatedConfig });
});

app.post('/save-config', (req, res) => {
  const { config, filename } = req.body;
  
  try {
    const outputPath = path.join(process.cwd(), filename || 'server-config.js');
    fs.writeFileSync(outputPath, config);
    res.json({ success: true, path: outputPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function generateConfigString(config) {
  const sections = [];
  
  sections.push(`const { DB } = require("@el-zazo/server-creator");`);
  sections.push('');
  sections.push('const db = new DB({');
  
  sections.push(`  dbType: "${config.dbType}",`);
  
  if (config.dbType === 'mongodb') {
    sections.push('  adapterConfig: {');
    sections.push('    mongodb: {');
    sections.push(`      uri: "${config.mongodb.uri}",`);
    if (config.mongodb.cacheEnabled) {
      sections.push('      cache: {');
      sections.push(`        enabled: ${config.mongodb.cacheEnabled},`);
      sections.push(`        ttl: ${config.mongodb.cacheTtl},`);
      sections.push(`        maxSize: ${config.mongodb.cacheMaxSize}`);
      sections.push('      }');
    }
    sections.push('    }');
    sections.push('  },');
  } else if (config.dbType === 'mysql') {
    sections.push('  adapterConfig: {');
    sections.push('    mysql: {');
    sections.push(`      host: "${config.mysql.host}",`);
    sections.push(`      port: ${config.mysql.port},`);
    sections.push(`      database: "${config.mysql.database}",`);
    sections.push(`      username: "${config.mysql.username}",`);
    sections.push(`      password: "${config.mysql.password}",`);
    if (config.mysql.cacheEnabled) {
      sections.push('      cache: {');
      sections.push(`        enabled: ${config.mysql.cacheEnabled},`);
      sections.push(`        ttl: ${config.mysql.cacheTtl},`);
      sections.push(`        maxSize: ${config.mysql.cacheMaxSize}`);
      sections.push('      }');
    }
    sections.push('    }');
    sections.push('  },');
  }
  
  sections.push('  serverOptions: {');
  sections.push(`    port: ${config.serverPort},`);
  if (config.corsEnabled) {
    sections.push('    corsOptions: {');
    sections.push(`      origin: "${config.corsOrigin}",`);
    sections.push(`      methods: ${JSON.stringify(config.corsMethods.split(',').map(m => m.trim()))},`);
    sections.push(`      credentials: ${config.corsCredentials}`);
    sections.push('    }');
  }
  sections.push('  },');
  
  if (config.enableAuth) {
    sections.push('  routerOptions: {');
    sections.push('    auth: {');
    sections.push('      keys: {');
    sections.push(`        identifiantKey: "${config.authIdentifiantKey}",`);
    sections.push(`        passwordKey: "${config.authPasswordKey}"`);
    sections.push('      },');
    sections.push(`      routes: ${JSON.stringify(config.authRoutes)},`);
    sections.push(`      protectedRoutes: ${JSON.stringify(config.authProtectedRoutes)},`);
    sections.push('      authMiddlewareOptions: {');
    sections.push(`        secret: "${config.authSecret}",`);
    sections.push(`        tokenFrom: "${config.authTokenFrom}",`);
    sections.push(`        headerName: "${config.authHeaderName}",`);
    if (config.authTokenFrom === 'query') {
      sections.push(`        queryParam: "${config.authQueryParam}"`);
    }
    if (config.authTokenFrom === 'cookie') {
      sections.push(`        cookieName: "${config.authCookieName}"`);
    }
    if (config.authTokenFrom === 'body') {
      sections.push(`        bodyField: "${config.authBodyField}"`);
    }
    sections.push(`        passthrough: ${config.authPassthrough}`);
    sections.push('      }');
    sections.push('    }');
    sections.push('  },');
  }
  
  if (config.collections && config.collections.length > 0) {
    const validCollections = config.collections.filter(c => c.name && c.name.trim());
    if (validCollections.length > 0) {
      sections.push('  collections: {');
      validCollections.forEach((collection, index) => {
        const collectionName = collection.name.trim();
        sections.push(`    ${collectionName}: {`);
        
        if (collection.prefix) {
          sections.push(`      prefix: "${collection.prefix}",`);
        }
        
        if (collection.enabled === false) {
          sections.push('      enabled: false,');
        }
        
        if (collection.fields && collection.fields.length > 0) {
          const validFields = collection.fields.filter(f => f.name && f.name.trim());
          if (validFields.length > 0) {
            sections.push('      fields: {');
            validFields.forEach((field, fIndex) => {
              sections.push(`        ${field.name}: ${field.value}` + (fIndex < validFields.length - 1 ? ',' : ''));
            });
            sections.push('      },');
          }
        }
        
        if (collection.routes && collection.routes.length > 0) {
          sections.push('      routerOptions: {');
          sections.push(`        routes: ${JSON.stringify(collection.routes)},`);
          
          if (collection.hasAuth) {
            sections.push('        auth: {');
            
            if (collection.authIdentifiantKey) {
              sections.push('          keys: {');
              sections.push(`            identifiantKey: "${collection.authIdentifiantKey}",`);
              sections.push(`            passwordKey: "${collection.authPasswordKey || 'password'}"`);
              sections.push('          },');
            }
            
            if (collection.authRoutes && collection.authRoutes.length > 0) {
              sections.push(`          routes: ${JSON.stringify(collection.authRoutes)},`);
            }
            
            if (collection.allProtected) {
              sections.push('          protectedRoutes: true,');
            } else if (collection.protectedRoutes && collection.protectedRoutes.length > 0) {
              sections.push(`          protectedRoutes: ${JSON.stringify(collection.protectedRoutes)},`);
            }
            
            if (collection.hasCollectionAccess) {
              sections.push('          collectionAccess: {');
              sections.push(`            accessDefault: ${collection.accessDefault !== false}`);
              sections.push('          }');
            }
            
            sections.push('        }');
          }
          
          sections.push('      }');
        }
        
        sections.push('    }' + (index < validCollections.length - 1 ? ',' : ''));
      });
      sections.push('  },');
    }
  }
  
  if (config.customRoutes && config.customRoutes.length > 0) {
    sections.push('  otherRoutes: [');
    config.customRoutes.forEach((route, index) => {
      sections.push('    {');
      sections.push(`      method: "${route.method}",`);
      sections.push(`      path: "${route.path}",`);
      sections.push(`      isProtected: ${route.isProtected},`);
      if (route.isProtected && config.enableAuth) {
        sections.push('      authMiddlewareOptions: {');
        sections.push(`        secret: "${config.authSecret}"`);
        sections.push('      }');
      }
      sections.push('    }' + (index < config.customRoutes.length - 1 ? ',' : ''));
    });
    sections.push('  ],');
  }
  
  sections.push('});');
  sections.push('');
  sections.push('db.start();');
  
  return sections.join('\n');
}

app.listen(PORT, () => {
  console.log(`Server Creator GUI running at http://localhost:${PORT}`);
});
