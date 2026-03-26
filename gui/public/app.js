document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  const dbType = document.getElementById('dbType');
  const mongodbConfig = document.getElementById('mongodbConfig');
  const mysqlConfig = document.getElementById('mysqlConfig');
  
  dbType.addEventListener('change', () => {
    if (dbType.value === 'mongodb') {
      mongodbConfig.classList.remove('hidden');
      mysqlConfig.classList.add('hidden');
    } else {
      mongodbConfig.classList.add('hidden');
      mysqlConfig.classList.remove('hidden');
    }
  });

  const mongodbCacheEnabled = document.getElementById('mongodbCacheEnabled');
  const mongodbCacheOptions = document.getElementById('mongodbCacheOptions');
  
  mongodbCacheEnabled.addEventListener('change', () => {
    mongodbCacheOptions.classList.toggle('hidden', !mongodbCacheEnabled.checked);
  });

  const mysqlCacheEnabled = document.getElementById('mysqlCacheEnabled');
  const mysqlCacheOptions = document.getElementById('mysqlCacheOptions');
  
  mysqlCacheEnabled.addEventListener('change', () => {
    mysqlCacheOptions.classList.toggle('hidden', !mysqlCacheEnabled.checked);
  });

  const corsEnabled = document.getElementById('corsEnabled');
  const corsOptions = document.getElementById('corsOptions');
  
  corsEnabled.addEventListener('change', () => {
    corsOptions.classList.toggle('hidden', !corsEnabled.checked);
  });

  const enableAuth = document.getElementById('enableAuth');
  const authOptions = document.getElementById('authOptions');
  
  enableAuth.addEventListener('change', () => {
    authOptions.classList.toggle('hidden', !enableAuth.checked);
  });

  const authTokenFrom = document.getElementById('authTokenFrom');
  const queryOptions = document.getElementById('queryOptions');
  const cookieOptions = document.getElementById('cookieOptions');
  const bodyOptions = document.getElementById('bodyOptions');
  
  authTokenFrom.addEventListener('change', () => {
    queryOptions.classList.add('hidden');
    cookieOptions.classList.add('hidden');
    bodyOptions.classList.add('hidden');
    
    if (authTokenFrom.value === 'query') {
      queryOptions.classList.remove('hidden');
    } else if (authTokenFrom.value === 'cookie') {
      cookieOptions.classList.remove('hidden');
    } else if (authTokenFrom.value === 'body') {
      bodyOptions.classList.remove('hidden');
    }
  });

  const addRouteBtn = document.getElementById('addRouteBtn');
  const customRoutesContainer = document.getElementById('customRoutes');
  let routeCount = 1;
  
  addRouteBtn.addEventListener('click', () => {
    const routeDiv = document.createElement('div');
    routeDiv.className = 'custom-route';
    routeDiv.dataset.index = routeCount;
    routeDiv.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label>Method</label>
          <select name="customRoutes[${routeCount}].method">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div class="form-group">
          <label>Path</label>
          <input type="text" name="customRoutes[${routeCount}].path" placeholder="/api/example">
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" name="customRoutes[${routeCount}].isProtected">
            Protected
          </label>
        </div>
        <button type="button" class="btn-remove" onclick="removeRoute(this)">Remove</button>
      </div>
    `;
    customRoutesContainer.appendChild(routeDiv);
    routeCount++;
  });

  const addCollectionBtn = document.getElementById('addCollectionBtn');
  const collectionsList = document.getElementById('collectionsList');
  let collectionCount = 1;
  
  addCollectionBtn.addEventListener('click', () => {
    const collectionDiv = document.createElement('div');
    collectionDiv.className = 'collection-item';
    collectionDiv.dataset.index = collectionCount;
    collectionDiv.innerHTML = `
      <div class="collection-header">
        <h4>Collection #${collectionCount + 1}</h4>
        <button type="button" class="btn-remove" onclick="removeCollection(this)">Remove</button>
      </div>
      
      <div class="form-group">
        <label>Collection/Table Name</label>
        <input type="text" name="collections[${collectionCount}].name" placeholder="e.g., users, products" class="collection-name">
      </div>
      
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" name="collections[${collectionCount}].enabled" checked>
          Enabled
        </label>
      </div>
      
      <div class="form-group">
        <label>API Prefix</label>
        <input type="text" name="collections[${collectionCount}].prefix" placeholder="/api/users (default: /collectionName)">
      </div>
      
      <div class="form-group">
        <label>Fields Configuration (for response filtering)</label>
        <p class="help-text-small">Format: fieldName:1 (include) or fieldName:0 (exclude)</p>
        <div class="fields-config">
          <div class="field-row">
            <input type="text" name="collections[${collectionCount}].fields[0].name" placeholder="field name">
            <select name="collections[${collectionCount}].fields[0].value">
              <option value="1">Include (1)</option>
              <option value="0">Exclude (0)</option>
            </select>
            <button type="button" class="btn-icon" onclick="addFieldRow(this)">+</button>
          </div>
        </div>
      </div>
      
      <div class="form-group">
        <label>Routes to Enable</label>
        <div class="checkbox-group-inline wrap">
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="getAll" checked> Get All</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="getOneById" checked> Get One</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="search" checked> Search</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="addOne" checked> Add One</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="addMany"> Add Many</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="updateOneById"> Update One</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="updateMany"> Update Many</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="deleteById"> Delete One</label>
          <label><input type="checkbox" name="collections[${collectionCount}].routes" value="deleteMany"> Delete Many</label>
        </div>
      </div>
      
      <div class="collection-auth-section">
        <h5>Collection-Specific Auth (Optional)</h5>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" name="collections[${collectionCount}].hasAuth" class="collection-has-auth">
            Override Global Auth Settings
          </label>
        </div>
        
        <div class="collection-auth-options hidden">
          <div class="form-group">
            <label>Identifier Key</label>
            <input type="text" name="collections[${collectionCount}].authIdentifiantKey" value="email" placeholder="e.g., email, username">
          </div>
          <div class="form-group">
            <label>Password Key</label>
            <input type="text" name="collections[${collectionCount}].authPasswordKey" value="password">
          </div>
          
          <div class="form-group">
            <label>Auth Routes</label>
            <div class="checkbox-group-inline">
              <label><input type="checkbox" name="collections[${collectionCount}].authRoutes" value="login"> Login</label>
              <label><input type="checkbox" name="collections[${collectionCount}].authRoutes" value="register"> Register</label>
              <label><input type="checkbox" name="collections[${collectionCount}].authRoutes" value="refreshToken"> Refresh Token</label>
              <label><input type="checkbox" name="collections[${collectionCount}].authRoutes" value="getUserByToken"> Get User</label>
            </div>
          </div>
          
          <div class="form-group">
            <label>Protected Routes</label>
            <div class="checkbox-group-inline">
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="getAll"> Get All</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="getOneById"> Get One</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="search"> Search</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="addOne"> Add One</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="addMany"> Add Many</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="updateOneById"> Update One</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="updateMany"> Update Many</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="deleteById"> Delete One</label>
              <label><input type="checkbox" name="collections[${collectionCount}].protectedRoutes" value="deleteMany"> Delete Many</label>
            </div>
          </div>
          
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" name="collections[${collectionCount}].allProtected">
              All Routes Protected
            </label>
          </div>
          
          <h5>Collection Access Control</h5>
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" name="collections[${collectionCount}].hasCollectionAccess">
              Enable Collection-Based Access
            </label>
          </div>
          
          <div class="collection-access-options hidden">
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" name="collections[${collectionCount}].accessDefault" checked>
                Default Access (allow by default)
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const hasAuthCheckbox = collectionDiv.querySelector('.collection-has-auth');
    const authOptionsDiv = collectionDiv.querySelector('.collection-auth-options');
    hasAuthCheckbox.addEventListener('change', () => {
      authOptionsDiv.classList.toggle('hidden', !hasAuthCheckbox.checked);
    });
    
    const hasCollectionAccessCheckbox = collectionDiv.querySelector('input[name="collections[' + collectionCount + '].hasCollectionAccess"]');
    const accessOptionsDiv = collectionDiv.querySelector('.collection-access-options');
    if (hasCollectionAccessCheckbox) {
      hasCollectionAccessCheckbox.addEventListener('change', () => {
        accessOptionsDiv.classList.toggle('hidden', !hasCollectionAccessCheckbox.checked);
      });
    }
    
    collectionsList.appendChild(collectionDiv);
    collectionCount++;
  });

  document.querySelectorAll('.collection-has-auth').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const optionsDiv = e.target.closest('.collection-auth-section').querySelector('.collection-auth-options');
      optionsDiv.classList.toggle('hidden', !e.target.checked);
    });
  });

  const generateBtn = document.getElementById('generateBtn');
  const saveBtn = document.getElementById('saveBtn');
  const copyBtn = document.getElementById('copyBtn');
  const configOutput = document.getElementById('configOutput');

  generateBtn.addEventListener('click', async () => {
    const formData = collectFormData();
    
    try {
      const response = await fetch('/generate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      configOutput.textContent = result.config;
    } catch (error) {
      configOutput.textContent = 'Error generating config: ' + error.message;
    }
  });

  saveBtn.addEventListener('click', async () => {
    const config = configOutput.textContent;
    if (!config || config.includes('Click "Generate Preview"')) {
      alert('Please generate the preview first');
      return;
    }
    
    const filename = document.getElementById('filename').value || 'server.js';
    
    try {
      const response = await fetch('/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, filename })
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Configuration saved to: ' + result.path);
      } else {
        alert('Error saving config: ' + result.error);
      }
    } catch (error) {
      alert('Error saving config: ' + error.message);
    }
  });

  copyBtn.addEventListener('click', () => {
    const config = configOutput.textContent;
    if (!config || config.includes('Click "Generate Preview"')) {
      alert('Please generate the preview first');
      return;
    }
    
    navigator.clipboard.writeText(config).then(() => {
      alert('Configuration copied to clipboard!');
    }).catch(err => {
      alert('Failed to copy: ' + err.message);
    });
  });
});

function removeRoute(btn) {
  btn.closest('.custom-route').remove();
}

function removeCollection(btn) {
  btn.closest('.collection-item').remove();
}

function addFieldRow(btn) {
  const fieldsConfig = btn.closest('.fields-config');
  const collectionIndex = fieldsConfig.closest('.collection-item').dataset.index;
  const fieldRows = fieldsConfig.querySelectorAll('.field-row');
  const fieldIndex = fieldRows.length;
  
  const fieldRow = document.createElement('div');
  fieldRow.className = 'field-row';
  fieldRow.innerHTML = `
    <input type="text" name="collections[${collectionIndex}].fields[${fieldIndex}].name" placeholder="field name">
    <select name="collections[${collectionIndex}].fields[${fieldIndex}].value">
      <option value="1">Include (1)</option>
      <option value="0">Exclude (0)</option>
    </select>
    <button type="button" class="btn-icon btn-remove-field" onclick="this.closest('.field-row').remove()">-</button>
  `;
  fieldsConfig.appendChild(fieldRow);
}

function collectFormData() {
  const form = document.getElementById('configForm');
  const formData = new FormData(form);
  
  const data = {
    dbType: formData.get('dbType'),
    serverPort: parseInt(formData.get('serverPort')) || 3000,
    corsEnabled: formData.get('corsEnabled') === 'on',
    corsOrigin: formData.get('corsOrigin'),
    corsMethods: formData.get('corsMethods'),
    corsCredentials: formData.get('corsCredentials') === 'on',
    enableAuth: formData.get('enableAuth') === 'on',
    authIdentifiantKey: formData.get('authIdentifiantKey'),
    authPasswordKey: formData.get('authPasswordKey'),
    authSecret: formData.get('authSecret'),
    authTokenFrom: formData.get('authTokenFrom'),
    authHeaderName: formData.get('authHeaderName'),
    authQueryParam: formData.get('authQueryParam'),
    authCookieName: formData.get('authCookieName'),
    authBodyField: formData.get('authBodyField'),
    authPassthrough: formData.get('authPassthrough') === 'on'
  };

  if (data.dbType === 'mongodb') {
    data.mongodb = {
      uri: document.getElementById('mongodbUri').value,
      cacheEnabled: document.getElementById('mongodbCacheEnabled').checked,
      cacheTtl: parseInt(document.getElementById('mongodbCacheTtl').value) || 300000,
      cacheMaxSize: parseInt(document.getElementById('mongodbCacheMaxSize').value) || 100
    };
  } else if (data.dbType === 'mysql') {
    data.mysql = {
      host: formData.get('mysql.host'),
      port: parseInt(formData.get('mysql.port')) || 3306,
      database: formData.get('mysql.database'),
      username: formData.get('mysql.username'),
      password: formData.get('mysql.password'),
      cacheEnabled: document.getElementById('mysqlCacheEnabled').checked,
      cacheTtl: parseInt(document.getElementById('mysqlCacheTtl').value) || 300000,
      cacheMaxSize: parseInt(document.getElementById('mysqlCacheMaxSize').value) || 100
    };
  }

  const authRoutes = [];
  document.querySelectorAll('input[name="authRoutes"]:checked').forEach(cb => {
    authRoutes.push(cb.value);
  });
  data.authRoutes = authRoutes;

  const authProtectedRoutes = [];
  document.querySelectorAll('input[name="authProtectedRoutes"]:checked').forEach(cb => {
    authProtectedRoutes.push(cb.value);
  });
  data.authProtectedRoutes = authProtectedRoutes;

  const customRoutes = [];
  document.querySelectorAll('.custom-route').forEach(routeDiv => {
    const method = routeDiv.querySelector('select').value;
    const path = routeDiv.querySelector('input[type="text"]').value;
    const isProtected = routeDiv.querySelector('input[type="checkbox"]').checked;
    
    if (path) {
      customRoutes.push({ method, path, isProtected });
    }
  });
  data.customRoutes = customRoutes;

  const collections = [];
  document.querySelectorAll('.collection-item').forEach(collectionDiv => {
    const name = collectionDiv.querySelector('.collection-name').value;
    if (!name || !name.trim()) return;
    
    const collection = {
      name: name.trim(),
      enabled: collectionDiv.querySelector('input[name$=".enabled"]')?.checked ?? true,
      prefix: collectionDiv.querySelector('input[name$=".prefix"]')?.value || '',
      routes: []
    };
    
    collectionDiv.querySelectorAll('input[name$=".routes"]:checked').forEach(cb => {
      collection.routes.push(cb.value);
    });
    
    const fields = [];
    collectionDiv.querySelectorAll('.field-row').forEach(fieldRow => {
      const fieldName = fieldRow.querySelector('input[type="text"]').value;
      const fieldValue = fieldRow.querySelector('select').value;
      if (fieldName && fieldName.trim()) {
        fields.push({
          name: fieldName.trim(),
          value: parseInt(fieldValue)
        });
      }
    });
    if (fields.length > 0) {
      collection.fields = fields;
    }
    
    const hasAuth = collectionDiv.querySelector('.collection-has-auth')?.checked;
    if (hasAuth) {
      collection.hasAuth = true;
      collection.authIdentifiantKey = collectionDiv.querySelector('input[name$=".authIdentifiantKey"]')?.value || 'email';
      collection.authPasswordKey = collectionDiv.querySelector('input[name$=".authPasswordKey"]')?.value || 'password';
      
      const authRoutes = [];
      collectionDiv.querySelectorAll('input[name$=".authRoutes"]:checked').forEach(cb => {
        authRoutes.push(cb.value);
      });
      if (authRoutes.length > 0) {
        collection.authRoutes = authRoutes;
      }
      
      const protectedRoutes = [];
      collectionDiv.querySelectorAll('input[name$=".protectedRoutes"]:checked').forEach(cb => {
        protectedRoutes.push(cb.value);
      });
      if (protectedRoutes.length > 0) {
        collection.protectedRoutes = protectedRoutes;
      }
      
      const allProtected = collectionDiv.querySelector('input[name$=".allProtected"]')?.checked;
      if (allProtected) {
        collection.allProtected = true;
      }
      
      const hasCollectionAccess = collectionDiv.querySelector('input[name$=".hasCollectionAccess"]')?.checked;
      if (hasCollectionAccess) {
        collection.hasCollectionAccess = true;
        collection.accessDefault = collectionDiv.querySelector('input[name$=".accessDefault"]')?.checked ?? true;
      }
    }
    
    collections.push(collection);
  });
  data.collections = collections;

  return data;
}
