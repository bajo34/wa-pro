(() => {
  // Basic configuration storage. Users can update these values via the UI.
  const tokenInput = document.getElementById('token');
  const tenantInput = document.getElementById('tenant');
  const saveConfigBtn = document.getElementById('saveConfig');
  const config = {
    token: tokenInput.value,
    tenant: tenantInput.value
  };

  // Helper to build headers for authenticated API requests.
  function getHeaders() {
    return {
      'x-panel-token': config.token,
      'x-tenant-id': config.tenant,
      'Content-Type': 'application/json'
    };
  }

  saveConfigBtn.addEventListener('click', () => {
    config.token = tokenInput.value;
    config.tenant = tenantInput.value;
    alert('Configuration updated');
  });

  // Cache frequently used data to reduce redundant requests. These caches are
  // refreshed when navigating between sections.
  let quickRepliesCache = [];
  let usersCache = [];
  let currentConversationId = null;

  // Navigation logic: clicking a nav button shows its section and triggers
  // data loading. Only one section is visible at any time.
  const navButtons = document.querySelectorAll('#nav button');
  const sections = document.querySelectorAll('.section');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const sectionId = btn.dataset.section;
      sections.forEach((s) => {
        s.style.display = s.id === sectionId ? 'block' : 'none';
      });
      // Lazy‑load data when section becomes visible
      switch (sectionId) {
        case 'dashboardSection':
          loadMetrics().catch((err) => console.error(err));
          break;
        case 'inboxSection':
          loadInbox().catch((err) => console.error(err));
          break;
        case 'quickRepliesSection':
          loadQuickReplies().catch((err) => console.error(err));
          break;
        case 'rulesSection':
          loadRules().catch((err) => console.error(err));
          break;
        case 'usersSection':
          loadUsers().catch((err) => console.error(err));
          break;
      }
    });
  });

  // Generic fetch wrapper that handles JSON responses and errors. Throws
  // descriptive errors when API responds with non‑OK status codes.
  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // Simple in-memory cache to avoid hammering /api/metrics on repeated renders/tab switches.
  let metricsCache = { at: 0, data: null };

  /**
   * Load and display dashboard metrics. This function calls the
   * `/api/metrics` endpoint and updates the metric cards accordingly.
   */
  async function loadMetrics() {
    const metricsEl = {
      open: document.getElementById('metricOpen'),
      closed: document.getElementById('metricClosed'),
      total: document.getElementById('metricTotalMsgs'),
      messages24: document.getElementById('metricMsgs24h')
    };
    try {
      const now = Date.now();
      const shouldUseCache = metricsCache.data && now - metricsCache.at < 30_000;
      const data = shouldUseCache
        ? metricsCache.data
        : await fetchJson('/api/metrics', { headers: getHeaders() });
      if (!shouldUseCache) metricsCache = { at: now, data };
      metricsEl.open.textContent = data.openConversations;
      metricsEl.closed.textContent = data.closedConversations;
      metricsEl.total.textContent = data.totalMessages;
      metricsEl.messages24.textContent = data.messages24h;
    } catch (err) {
      console.error(err);
      metricsEl.open.textContent = '-';
      metricsEl.closed.textContent = '-';
      metricsEl.total.textContent = '-';
      metricsEl.messages24.textContent = '-';
    }
  }

  /**
   * Inbox functionality. Fetches open conversations and renders them in
   * a list. Clicking a conversation opens the thread view where messages
   * can be read and replied to. Assignment controls are also available.
   */
  const inboxEl = document.getElementById('inbox');
  const refreshInboxBtn = document.getElementById('refreshInbox');
  const searchInboxInput = document.getElementById('searchInbox');
  const convoContainer = document.getElementById('conversationContainer');
  const conversationMain = document.getElementById('conversationMain');
  const contactDetailsDiv = document.getElementById('contactDetails');
  const contactJidEl = document.getElementById('contactJid');
  const contactNotesEl = document.getElementById('contactNotes');
  const saveNotesBtn = document.getElementById('saveNotesBtn');
  const messagesEl = document.getElementById('messages');
  const replyForm = document.getElementById('replyForm');
  const replyText = document.getElementById('replyText');
  const replyImage = document.getElementById('replyImage');
  const backButton = document.getElementById('backButton');
  const assignUserSelect = document.getElementById('assignUserSelect');
  const assignBtn = document.getElementById('assignBtn');
  const unassignBtn = document.getElementById('unassignBtn');
  const quickReplyPanel = document.getElementById('quickReplyPanel');
  const quickReplyListEl = document.getElementById('quickReplyList');

  // Cache loaded conversations so the search filter can operate client side.
  let conversationsCache = [];

  refreshInboxBtn.addEventListener('click', () => {
    loadInbox().catch((err) => alert(err.message));
  });

  // Apply search filter on keyup/input. Filters conversations by remote_jid.
  if (searchInboxInput) {
    searchInboxInput.addEventListener('input', () => {
      const query = searchInboxInput.value.trim().toLowerCase();
      const filtered = !query
        ? conversationsCache
        : conversationsCache.filter((c) => c.remote_jid.toLowerCase().includes(query));
      renderInbox(filtered);
    });
  }

  async function loadInbox() {
    inboxEl.innerHTML = 'Loading conversations...';
    convoContainer.style.display = 'none';
    try {
      const conversations = await fetchJson('/api/inbox', { headers: getHeaders() });
      conversationsCache = Array.isArray(conversations) ? conversations : [];
      const query = searchInboxInput ? searchInboxInput.value.trim().toLowerCase() : '';
      const filtered = !query
        ? conversationsCache
        : conversationsCache.filter((c) => c.remote_jid.toLowerCase().includes(query));
      renderInbox(filtered);
    } catch (err) {
      inboxEl.textContent = 'Error: ' + err.message;
    }
  }

  function renderInbox(conversations) {
    inboxEl.innerHTML = '';
    if (!Array.isArray(conversations) || conversations.length === 0) {
      inboxEl.textContent = 'No open conversations.';
      return;
    }
    conversations.forEach((convo) => {
      const div = document.createElement('div');
      div.className = 'conversation';
      const left = document.createElement('span');
      left.textContent = convo.remote_jid;
      const right = document.createElement('span');
      right.textContent = convo.status;
      right.style.fontSize = '0.8rem';
      right.style.color = '#555';
      div.appendChild(left);
      div.appendChild(right);
      div.addEventListener('click', () => openConversation(convo.id));
      inboxEl.appendChild(div);
    });
  }

  async function openConversation(convoId) {
    currentConversationId = convoId;
    // Hide the inbox list and show the conversation container
    inboxEl.style.display = 'none';
    refreshInboxBtn.style.display = 'none';
    convoContainer.style.display = 'block';
    // Populate messages, quick replies, assignable users and contact details
    await Promise.all([
      loadMessages(convoId),
      loadQuickRepliesForConversation(),
      populateAssignUsers(),
      loadConversationDetails(convoId)
    ]);
    // Set up reply form handler
    replyForm.onsubmit = async (e) => {
      e.preventDefault();
      await sendReply(convoId);
    };
    backButton.onclick = () => {
      convoContainer.style.display = 'none';
      inboxEl.style.display = 'block';
      refreshInboxBtn.style.display = 'inline-block';
      messagesEl.innerHTML = '';
      quickReplyPanel.style.display = 'none';
      currentConversationId = null;
      // Hide contact details panel
      if (contactDetailsDiv) contactDetailsDiv.style.display = 'none';
    };
    assignBtn.onclick = async () => {
      const userId = assignUserSelect.value;
      if (!userId) {
        alert('Select a user to assign');
        return;
      }
      try {
        await fetchJson(`/api/assignment/${convoId}/assign`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ userId })
        });
        alert('Conversation assigned');
      } catch (err) {
        alert('Error assigning: ' + err.message);
      }
    };
    unassignBtn.onclick = async () => {
      try {
        await fetchJson(`/api/assignment/${convoId}/unassign`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        alert('Conversation unassigned');
      } catch (err) {
        alert('Error unassigning: ' + err.message);
      }
    };

    // Save notes handler
    if (saveNotesBtn) {
      saveNotesBtn.onclick = async () => {
        const notes = contactNotesEl.value;
        try {
          await fetchJson(`/api/inbox/${convoId}/notes`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ notes })
          });
          alert('Notes saved');
        } catch (err) {
          alert('Error saving notes: ' + err.message);
        }
      };
    }
  }

  /**
   * Load conversation details (JID and notes) and display them. If the
   * conversation or details cannot be loaded, the contact panel is hidden.
   */
  async function loadConversationDetails(convoId) {
    if (!contactDetailsDiv) return;
    try {
      const details = await fetchJson(`/api/inbox/${convoId}/details`, { headers: getHeaders() });
      contactJidEl.textContent = details.remote_jid;
      contactNotesEl.value = details.notes || '';
      contactDetailsDiv.style.display = 'block';
    } catch (err) {
      // If details cannot be loaded, hide the contact panel
      contactDetailsDiv.style.display = 'none';
    }
  }

  async function loadMessages(convoId) {
    messagesEl.innerHTML = 'Loading messages...';
    try {
      const msgs = await fetchJson(`/api/inbox/${convoId}/messages`, { headers: getHeaders() });
      renderMessages(msgs);
    } catch (err) {
      messagesEl.textContent = 'Error loading messages: ' + err.message;
    }
  }

  function renderMessages(msgs) {
    messagesEl.innerHTML = '';
    if (!Array.isArray(msgs) || msgs.length === 0) {
      messagesEl.textContent = 'No messages yet.';
      return;
    }
    msgs.forEach((msg) => {
      const div = document.createElement('div');
      const sender = msg.sender_type || 'agent';
      div.className = 'message ' + sender;
      if (msg.text) {
        const span = document.createElement('span');
        span.textContent = msg.text;
        div.appendChild(span);
      }
      if (msg.image_url) {
        const img = document.createElement('img');
        img.src = msg.image_url;
        img.alt = '';
        img.style.maxWidth = '100%';
        img.style.marginTop = '0.5rem';
        div.appendChild(img);
      }
      messagesEl.appendChild(div);
    });
    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendReply(convoId) {
    const text = replyText.value.trim();
    const image = replyImage.value.trim();
    if (!text && !image) {
      alert('Please enter text or provide an image URL');
      return;
    }
    const body = {};
    if (text) body.text = text;
    if (image) body.imageUrl = image;
    try {
      await fetchJson(`/api/inbox/${convoId}/reply`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
      });
      replyText.value = '';
      replyImage.value = '';
      await loadMessages(convoId);
    } catch (err) {
      alert('Error sending reply: ' + err.message);
    }
  }

  /**
   * Populate the assign user dropdown with the current users cache. If the
   * cache is empty, this triggers a fetch of the users list first.
   */
  async function populateAssignUsers() {
    if (usersCache.length === 0) {
      await loadUsers();
    }
    assignUserSelect.innerHTML = '<option value="">-- Select user --</option>';
    usersCache.forEach((user) => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = `${user.username} (${user.role})`;
      assignUserSelect.appendChild(opt);
    });
  }

  /**
   * Quick replies used within a conversation. This function displays the
   * cached quick replies and attaches click handlers that insert the text
   * into the reply input when selected. If the cache is empty, it
   * triggers a fetch via loadQuickReplies().
   */
  async function loadQuickRepliesForConversation() {
    if (quickRepliesCache.length === 0) {
      await loadQuickReplies();
    }
    if (quickRepliesCache.length === 0) {
      quickReplyPanel.style.display = 'none';
      return;
    }
    quickReplyPanel.style.display = 'block';
    quickReplyListEl.innerHTML = '';
    quickRepliesCache.forEach((qr) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = qr.label;
      btn.addEventListener('click', () => {
        // Insert the quick reply text into the message input. Variables are
        // replaced on the server side; here we simply copy the text.
        replyText.value = qr.text;
      });
      li.appendChild(btn);
      quickReplyListEl.appendChild(li);
    });
  }

  /**
   * Load and render all quick replies for management. Updates the
   * quickRepliesCache for reuse in other sections.
   */
  const quickRepliesList = document.getElementById('quickRepliesList');
  const quickReplyForm = document.getElementById('quickReplyForm');
  quickReplyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('quickReplyLabel').value.trim();
    const text = document.getElementById('quickReplyText').value.trim();
    if (!label || !text) {
      alert('Label and text are required');
      return;
    }
    try {
      await fetchJson('/api/quick-replies', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ label, text })
      });
      document.getElementById('quickReplyLabel').value = '';
      document.getElementById('quickReplyText').value = '';
      await loadQuickReplies();
      alert('Quick reply created');
    } catch (err) {
      alert('Error creating quick reply: ' + err.message);
    }
  });

  async function loadQuickReplies() {
    try {
      const rows = await fetchJson('/api/quick-replies', { headers: getHeaders() });
      quickRepliesCache = rows;
      renderQuickRepliesList(rows);
    } catch (err) {
      quickRepliesList.innerHTML = `<tr><td colspan="4">Error loading quick replies: ${err.message}</td></tr>`;
    }
  }

  function renderQuickRepliesList(rows) {
    quickRepliesList.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      quickRepliesList.innerHTML = '<tr><td colspan="4">No quick replies.</td></tr>';
      return;
    }
    rows.forEach((qr) => {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.textContent = qr.label;
      const textTd = document.createElement('td');
      textTd.textContent = qr.text;
      const createdTd = document.createElement('td');
      createdTd.textContent = new Date(qr.created_at).toLocaleString();
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this quick reply?')) return;
        try {
          await fetchJson(`/api/quick-replies/${qr.id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          await loadQuickReplies();
        } catch (err) {
          alert('Error deleting: ' + err.message);
        }
      });
      actionsTd.appendChild(delBtn);
      tr.appendChild(labelTd);
      tr.appendChild(textTd);
      tr.appendChild(createdTd);
      tr.appendChild(actionsTd);
      quickRepliesList.appendChild(tr);
    });
  }

  /**
   * Rules management. CRUD operations for keyword‑based automation rules.
   */
  const rulesList = document.getElementById('rulesList');
  const ruleForm = document.getElementById('ruleForm');
  ruleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawKeywords = document.getElementById('ruleKeywords').value.trim();
    const action = document.getElementById('ruleAction').value.trim();
    if (!rawKeywords || !action) {
      alert('Keywords and action are required');
      return;
    }
    const triggerKeywords = rawKeywords.split(',').map((k) => k.trim()).filter((k) => k);
    if (triggerKeywords.length === 0) {
      alert('Please provide at least one keyword');
      return;
    }
    try {
      await fetchJson('/api/rules', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ triggerKeywords, action })
      });
      document.getElementById('ruleKeywords').value = '';
      document.getElementById('ruleAction').value = '';
      await loadRules();
      alert('Rule created');
    } catch (err) {
      alert('Error creating rule: ' + err.message);
    }
  });

  async function loadRules() {
    try {
      const rows = await fetchJson('/api/rules', { headers: getHeaders() });
      renderRulesList(rows);
    } catch (err) {
      rulesList.innerHTML = `<tr><td colspan="4">Error loading rules: ${err.message}</td></tr>`;
    }
  }

  function renderRulesList(rows) {
    rulesList.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      rulesList.innerHTML = '<tr><td colspan="4">No rules.</td></tr>';
      return;
    }
    rows.forEach((rule) => {
      const tr = document.createElement('tr');
      const keywordsTd = document.createElement('td');
      keywordsTd.textContent = Array.isArray(rule.trigger_keywords)
        ? rule.trigger_keywords.join(', ')
        : rule.trigger_keywords;
      const actionTd = document.createElement('td');
      actionTd.textContent = rule.action;
      const createdTd = document.createElement('td');
      createdTd.textContent = new Date(rule.created_at).toLocaleString();
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this rule?')) return;
        try {
          await fetchJson(`/api/rules/${rule.id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          await loadRules();
        } catch (err) {
          alert('Error deleting rule: ' + err.message);
        }
      });
      actionsTd.appendChild(delBtn);
      tr.appendChild(keywordsTd);
      tr.appendChild(actionTd);
      tr.appendChild(createdTd);
      tr.appendChild(actionsTd);
      rulesList.appendChild(tr);
    });
  }

  /**
   * Users management. Allows creating, updating and deleting panel users.
   * Passwords must be pre‑hashed before submission. For production use,
   * integrate proper authentication and validation.
   */
  const usersListEl = document.getElementById('usersList');
  const userForm = document.getElementById('userForm');
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('userUsername').value.trim();
    const passwordHash = document.getElementById('userPasswordHash').value.trim();
    const role = document.getElementById('userRole').value;
    if (!username || !passwordHash) {
      alert('Username and password hash are required');
      return;
    }
    try {
      await fetchJson('/api/users', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ username, passwordHash, role })
      });
      document.getElementById('userUsername').value = '';
      document.getElementById('userPasswordHash').value = '';
      await loadUsers();
      alert('User created');
    } catch (err) {
      alert('Error creating user: ' + err.message);
    }
  });

  async function loadUsers() {
    try {
      const rows = await fetchJson('/api/users', { headers: getHeaders() });
      usersCache = rows;
      renderUsersList(rows);
    } catch (err) {
      usersListEl.innerHTML = `<tr><td colspan="5">Error loading users: ${err.message}</td></tr>`;
    }
  }

  function renderUsersList(rows) {
    usersListEl.innerHTML = '';
    if (!Array.isArray(rows) || rows.length === 0) {
      usersListEl.innerHTML = '<tr><td colspan="5">No users.</td></tr>';
      return;
    }
    rows.forEach((user) => {
      const tr = document.createElement('tr');
      const usernameTd = document.createElement('td');
      usernameTd.textContent = user.username;
      const roleTd = document.createElement('td');
      // Role dropdown for editing
      const roleSelect = document.createElement('select');
      ['agent', 'admin', 'supervisor', 'viewer'].forEach((roleOpt) => {
        const option = document.createElement('option');
        option.value = roleOpt;
        option.textContent = roleOpt;
        if (roleOpt === user.role) option.selected = true;
        roleSelect.appendChild(option);
      });
      roleTd.appendChild(roleSelect);
      const createdTd = document.createElement('td');
      createdTd.textContent = new Date(user.created_at).toLocaleString();
      const updatedTd = document.createElement('td');
      updatedTd.textContent = new Date(user.updated_at).toLocaleString();
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions';
      const updateBtn = document.createElement('button');
      updateBtn.textContent = 'Update Role';
      updateBtn.className = 'update';
      updateBtn.addEventListener('click', async () => {
        const newRole = roleSelect.value;
        if (newRole === user.role) {
          alert('Select a different role to update');
          return;
        }
        try {
          await fetchJson(`/api/users/${user.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ role: newRole })
          });
          await loadUsers();
          alert('Role updated');
        } catch (err) {
          alert('Error updating role: ' + err.message);
        }
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this user?')) return;
        try {
          await fetchJson(`/api/users/${user.id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          await loadUsers();
        } catch (err) {
          alert('Error deleting user: ' + err.message);
        }
      });
      actionsTd.appendChild(updateBtn);
      actionsTd.appendChild(delBtn);
      tr.appendChild(usernameTd);
      tr.appendChild(roleTd);
      tr.appendChild(createdTd);
      tr.appendChild(updatedTd);
      tr.appendChild(actionsTd);
      usersListEl.appendChild(tr);
    });
  }

  // Initialise dashboard on first load
  loadMetrics().catch((err) => console.error(err));
})();