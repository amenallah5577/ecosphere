/* ===================================================
   EchoSphere — app.js
   All client-side functionality for the UI
   =================================================== */

// ---- Sidebar ----

function toggleLeftSidebar() {
    const sidebar = document.getElementById('leftSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
    if (isOpen) fetchHistory();
}

// ---- New Chat ----

function startNewChat() {
    const feed = document.getElementById('feed');
    // Remove all child nodes except the welcome screen
    Array.from(feed.children).forEach(child => {
        if (child.id !== 'welcomeScreen') child.remove();
    });
    document.getElementById('welcomeScreen').classList.remove('display-none');
    toggleLeftSidebar();
}

// ---- History ----

let allHistory = [];

async function fetchHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="history-empty">Loading…</div>';
    try {
        const res = await fetch('/api/history');
        if (!res.ok) throw new Error('Failed to fetch');
        allHistory = await res.json();
        renderHistory(allHistory);
    } catch (err) {
        console.error('Failed to fetch history:', err);
        list.innerHTML = '<div class="history-empty">Could not load history.</div>';
    }
}

function renderHistory(items) {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    if (!items.length) {
        list.innerHTML = '<div class="history-empty">No history yet.</div>';
        return;
    }
    items.forEach(item => {
        const date = item.date ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="history-item-icon">⚡</div>
            <div class="history-item-content">
                <div class="history-item-title">${escapeHtml(item.title || item.prompt)}</div>
                <div class="history-item-date">${escapeHtml(date)}</div>
            </div>`;
        el.addEventListener('click', () => setInput(item.prompt));
        list.appendChild(el);
    });
}

function filterHistory() {
    const q = document.getElementById('historySearch').value.toLowerCase();
    const filtered = allHistory.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.prompt || '').toLowerCase().includes(q)
    );
    renderHistory(filtered);
}

// ---- Theme ----

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    document.querySelector('.moon-icon').classList.toggle('display-none', !isDark);
    document.querySelector('.sun-icon').classList.toggle('display-none', isDark);
    localStorage.setItem('echosphere-theme', newTheme);
}

// ---- Input Helpers ----

function setInput(text) {
    const input = document.getElementById('taskInput');
    input.value = text;
    autoResize(input);
    input.focus();
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleTask();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// ---- PDF UI ----

function togglePdfManager() {
    const manager = document.getElementById('inlinePdfManager');
    manager.classList.toggle('display-none');
}

function mockFileUpload() {
    document.getElementById('uploadZone').classList.add('display-none');
    document.getElementById('pdfAttached').classList.remove('display-none');
}

function removeAttachedPdf() {
    document.getElementById('pdfAttached').classList.add('display-none');
    document.getElementById('inlinePdfViewer').classList.add('display-none');
    document.getElementById('uploadZone').classList.remove('display-none');
}

function togglePdfViewer() {
    document.getElementById('inlinePdfViewer').classList.toggle('display-none');
}

// ---- Core Task Handling ----

async function handleTask() {
    const input = document.getElementById('taskInput');
    const task = input.value.trim();
    if (!task) return;

    input.value = '';
    autoResize(input);

    // Hide welcome screen on first submission
    const welcome = document.getElementById('welcomeScreen');
    if (welcome) welcome.classList.add('display-none');

    const feed = document.getElementById('feed');

    // Insert a loading card
    const loadingCard = document.createElement('div');
    loadingCard.className = 'card-loading';
    loadingCard.innerHTML = `
        <div class="loading-icon-placeholder"></div>
        <div class="loading-lines">
            <div class="skeleton-line w-75"></div>
            <div class="skeleton-line w-90"></div>
            <div class="skeleton-line w-55"></div>
        </div>`;
    feed.appendChild(loadingCard);
    feed.scrollTop = feed.scrollHeight;

    // Status text phases
    const statusEl = document.getElementById('loadingStatus');
    const statusText = document.getElementById('statusText');
    if (statusEl && statusText) {
        statusEl.classList.add('active');
        const phases = [
            'Querying external data sources…',
            'Aggregating real-time results…',
            'Formatting protocol response…'
        ];
        let phaseIndex = 0;
        statusText.textContent = phases[0];
        const phaseInterval = setInterval(() => {
            phaseIndex++;
            if (phaseIndex < phases.length) statusText.textContent = phases[phaseIndex];
        }, 1500);

        try {
            const response = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task })
            });
            const data = await response.json();
            clearInterval(phaseInterval);
            statusEl.classList.remove('active');
            loadingCard.remove();
            renderCard(data);
        } catch (err) {
            clearInterval(phaseInterval);
            console.error('Agent request failed:', err);
            statusText.textContent = 'Unable to process request. Please try again.';
            loadingCard.remove();
            setTimeout(() => statusEl.classList.remove('active'), 3000);
        }
    } else {
        // Fallback if status elements not present
        try {
            const response = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task })
            });
            const data = await response.json();
            loadingCard.remove();
            renderCard(data);
        } catch (err) {
            console.error('Agent request failed:', err);
            loadingCard.remove();
        }
    }
}

function renderCard(data) {
    const feed = document.getElementById('feed');
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const metricsHtml = metrics.map(m => `<span class="metric-badge">${escapeHtml(m)}</span>`).join('');

    const card = document.createElement('div');
    card.className = 'card';

    const safeUrl = sanitizeUrl(data.realUrl);
    const formattedDesc = escapeHtml(data.desc || '').replace(/\n/g, '<br>');
    card.innerHTML = `
        <div class="card-icon">${data.icon || '⚡'}</div>
        <div class="card-content">
            <h3>${escapeHtml(data.title || '')}</h3>
            <p>${formattedDesc}</p>
            <div class="metrics-row">${metricsHtml}</div>
            <div class="action-buttons">
                <button class="btn js-primary-action">${escapeHtml(data.primaryAction || 'Open')}</button>
                <button class="btn btn-outline js-dismiss-action">${escapeHtml(data.secondaryAction || 'Dismiss')}</button>
            </div>
        </div>`;

    card.querySelector('.js-primary-action').addEventListener('click', () => {
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
    });
    card.querySelector('.js-dismiss-action').addEventListener('click', () => {
        card.remove();
    });

    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
}

// ---- Utility ----

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '#';
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
    // Inject status bar into feed if not present
    const feed = document.getElementById('feed');
    if (feed && !document.getElementById('loadingStatus')) {
        const status = document.createElement('div');
        status.id = 'loadingStatus';
        status.className = 'loading-status';
        status.innerHTML = '<div class="spinner"></div><span id="statusText">Processing request…</span>';
        feed.parentElement.insertBefore(status, feed.nextSibling);
    }

    // Restore theme preference
    const saved = localStorage.getItem('echosphere-theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        if (saved === 'light') {
            document.querySelector('.moon-icon').classList.add('display-none');
            document.querySelector('.sun-icon').classList.remove('display-none');
        }
    }
});
