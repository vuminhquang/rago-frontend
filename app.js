"use strict";
(() => {
  const previewParam = new URLSearchParams(location.search).get("preview");
  const preview = previewParam === "1" || (location.protocol === "file:" && previewParam !== "0");
  const app = document.getElementById("app");
  const key = "rago-static-folder-drafts-v1";
  const icon = (id,extra="") => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
  const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nf = n => new Intl.NumberFormat("en-US").format(n);
  const routes = {overview:"Overview",devices:"Devices",online:"Remote Devices",folders:"Folders","add-device":"Add your Device",search:"Local Search",connections:"MCP Connections",activity:"Activity",settings:"Settings",help:"Help"};
  const navMain = [["overview","home"],["connections","link"],["settings","settings"]];
  const navDevices = [["devices","monitor"],["folders","folder"],["add-device","plus"]];
  const href = name => "#/" + name;
  const demoIndexing = preview && new URLSearchParams(location.search).get("indexing") !== "idle";
  const demoDevice = {id:"workstation-01",name:"Workstation-01",platform:"macOS",agent:"RAGO Agent"};
  const demoDevices = preview?[demoDevice]:[];
  const demoFolders = [
    {name:"rago-knows-best",path:"/Users/rago/Projects/rago-knows-best",deviceId:demoDevice.id,state:"indexed",count:642318,indexed:"Today, 09:12"},
    {name:"dev-speaknow",path:"/Users/rago/Projects/dev-speaknow",deviceId:demoDevice.id,state:demoIndexing?"indexing":"indexed",count:352418,indexed:demoIndexing?"In progress":"Today, 09:14",percent:demoIndexing?68:100},
    {name:"company-notes",path:"/Users/rago/Knowledge/company-notes",deviceId:demoDevice.id,state:"indexed",count:124982,indexed:"Today, 08:56"}
  ];
  const demoOverviewFolders = [
    ["rago-knows-best","/Projects/rago-knows-best","642","1.9 GB"],
    ["dev-speaknow","/Projects/dev-speaknow","518","1.2 GB"],
    ["company-notes","/Knowledge/company-notes","124","412 MB"]
  ];
  const demoEvents = [
    ["check","Indexing completed: rago-knows-best","3 min ago"],
    ["layers","Indexing started: dev-speaknow (42,318 files)","18 min ago"],
    ["link","MCP connection: Claude (active)","48 min ago"],
    ["link","MCP connection: ChatGPT (active)","50 min ago"],
    ["monitor","Device connected: Workstation-01","Today, 09:14"]
  ];
  let overlay=null, popup=null, rowMenu=-1, drawer=false, pendingPath="";
  let devicesExpanded=true,setupStep=1;
  let localSession=null, heartbeatTimer=0, searchResults=null, searchQuery="",activeOperation=false, pendingGrant=null;
  let remoteDevices=null, remoteSignedOut=false, remoteBusy=false, remoteError="", remoteCredential=null;
  const onlineEndpoint="/api/online/device";
  const localEndpoint="http://127.0.0.1:47743";
  let toastTimer=0;
  const drafts=()=>{
    try {const a=JSON.parse(sessionStorage.getItem(key)||"[]");return Array.isArray(a)?a.filter(x=>typeof x==="string"&&x.length<=1024).slice(0,16):[]}
    catch{return []}
  };
  const saveDrafts=a=>{try{sessionStorage.setItem(key,JSON.stringify(a));return true}catch{return false}};
  function route() {
    const raw=decodeURIComponent(location.hash.replace(/^#\//,"")).split("?")[0]||"overview";
    return Object.hasOwn(routes,raw)?raw:"not-found";
  }
  function sidebar(page) {
    const navLink=([name,ic],child=false)=>`<a href="${href(name)}" class="nav-link${child?" nav-child-link":""}${page===name?" active":""}" ${page===name?'aria-current="page"':""}>${icon(ic)}<span>${routes[name]}</span></a>`;
    const inGroup=navDevices.some(([name])=>name===page);
    const group=`<div class="nav-device-group"><button type="button" class="nav-link nav-group-toggle${inGroup?" group-current":""}" data-do="toggle-devices-group" aria-expanded="${devicesExpanded}" aria-controls="devices-subnav">${icon("layers")}<span>Devices &amp; Folders</span>${icon("chevron-down","nav-group-chevron")}</button><div id="devices-subnav" class="nav-subgroup" ${devicesExpanded?"":"hidden"}>${navDevices.map(item=>navLink(item,true)).join("")}</div></div>`;
    const items=[navLink(navMain[0]),group,...(localSession&&!preview?[navLink(["search","search"])]:[]),...navMain.slice(1).map(item=>navLink(item))];
    return `<aside class="sidebar sidebar-${page==="overview"?"overview":"folders"}" id="sidebar" aria-label="Main navigation">
      <div class="brand">
        <span class="brand-logo" aria-hidden="true">
          <img class="brand-asset" src="./assets/rago-stack-logo.webp" alt="" width="52" height="52">
        </span>
        <span class="brand-name"><strong>RAGO</strong><span>Knows Best</span></span>
      </div>
      <nav class="nav" aria-label="RAGO navigation">${items.join("")}</nav>
      <div class="sidebar-bottom">
        <div class="agent-card ${preview||localSession?"is-sample":""}">
          <i class="agent-dot" aria-hidden="true"></i>
          <span><span class="agent-status">${preview?"Agent Online":localSession?"Local Agent Connected":"Agent Not Connected"}</span>
          <span class="agent-sub">${preview?"Sample device • preview":localSession?"Development session • localhost":"Requires paired RAGO Agent"}</span></span>
        </div>
        <div class="sidebar-version">RAGO v0.1.0 (${localSession?"Local development":"Design preview"})</div>
      </div>
    </aside>`;
  }
  function topbar(page) {
    const crumb=page==="online"?`<h1 class="top-title">Remote Devices</h1>`:`<div class="top-title">${routes[page]??"Page not found"}</div>`;
    const avatar=icon("user");
    return `<header class="topbar">
      <div class="topbar-left"><button class="mobile-trigger" data-do="drawer" aria-label="Toggle navigation">${icon("menu")}</button>${crumb}</div>
      <div class="top-actions">
        ${preview?'<span class="preview-indicator" title="Illustrative data, no backend connection">DESIGN PREVIEW</span>':localSession?'<span class="preview-indicator" title="Authenticated development-only loopback connection">LOCAL SESSION</span>':""}
        <button class="round-icon" data-do="help-pop" title="Help" aria-label="Help">${icon("help")}</button>
        <button class="round-icon" data-do="notifications-pop" title="Notifications" aria-label="Notifications">${icon("bell")}<i class="notif-dot"></i></button>
        <span class="account-divider"></span>
        <button class="account-button" data-do="account-pop" aria-label="Account menu" aria-haspopup="menu">
          <span class="avatar">${avatar}</span>
          <span class="account-info"><strong>RAGO Workspace</strong></span>
          ${icon("chevron-down","down")}
        </button>
      </div>
      ${renderPopup()}
    </header>`;
  }
  function renderPopup() {
    if(popup==="help") return `<div class="popover" role="dialog" aria-label="Help">
      <h3>Help &amp; guidance</h3><p>RAGO uses a local Agent for indexing and separate authorization for AI hosts. This static preview does not connect to the Agent.</p><a href="#/help">View help</a></div>`;
    if(popup==="notifications") return `<div class="popover" role="dialog" aria-label="Notifications">
      <h3>Notifications</h3><p>${preview?"Activity shown in this preview is illustrative.":"No live notifications. Backend integration is not configured."}</p><a href="#/activity">View activity</a></div>`;
    if(popup==="account") return `<div class="popover" role="menu" aria-label="Account options">
      <h3>RAGO Workspace</h3><p>Local mode needs no account. Use Remote Devices to manage your optional Siglet connection.</p>
      <a role="menuitem" href="#/online">Remote Devices</a>
      <a role="menuitem" href="#/settings">Settings</a></div>`;
    return "";
  }
  function hero() {
    return `<section class="hero" aria-label="RAGO knowledge search">
      <svg class="hero-waves" aria-hidden="true" viewBox="0 0 1350 235" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveLight" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#3523b0" stop-opacity="0"/>
            <stop offset=".43" stop-color="#8368ff" stop-opacity=".55"/>
            <stop offset=".78" stop-color="#cda5ff" stop-opacity=".9"/>
            <stop offset="1" stop-color="#9d65ff" stop-opacity=".7"/>
          </linearGradient>
          <linearGradient id="waveDeep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#8e58fa" stop-opacity="0"/>
            <stop offset=".58" stop-color="#2d3fea" stop-opacity=".55"/>
            <stop offset="1" stop-color="#ab32d9" stop-opacity=".85"/>
          </linearGradient>
        </defs>
        <path d="M410 280 Q660 265 766 186 T1127 113 T1410 21 L1410 280Z" fill="url(#waveLight)" opacity=".55"/>
        <path d="M520 275 Q730 227 851 176 T1192 91 T1415 50" fill="none" stroke="#c1a2ff" stroke-width="1.7" opacity=".75"/>
        <path d="M588 271 Q773 219 875 147 T1230 119 T1412 38" fill="none" stroke="#9b8cf7" stroke-width="1.1" opacity=".6"/>
        <path d="M751 266 Q922 195 1055 125 T1409 63 L1409 266Z" fill="url(#waveDeep)" opacity=".63"/>
      </svg>
      <div class="hero-copy">
        <h1>Turn your local knowledge<br>into context for ChatGPT and Claude.</h1>
        <p>RAGO indexes your own documents and code with BM25, ripgrep, and<br class="wide-only"> FractalRAG, then serves them to ChatGPT and Claude via the MCP protocol.</p>
        <div class="hero-actions">
          <button class="button white" data-do="how">${icon("play","small")} See How It Works</button>
          <button class="button outline" data-do="docs">${icon("external","small")} View Documentation</button>
        </div>
      </div>
      <div class="hero-docs" aria-hidden="true">
        <img class="hero-art" src="./assets/floating_rag_document_cards.webp" width="400" height="289" alt="">
      </div>
      <div class="hero-citation">
        ${icon("file")}
        <div><strong>Citations with Document Location</strong>
          <span>e.g., file, section, and line range<br>(or chunk reference)</span></div>
        <button data-do="citations" title="Source citations" aria-label="About citations">${icon("external")}</button>
      </div>
    </section>`;
  }
  function stat(ic,label,value,sub,good=false) {
    return `<div class="panel stat-card${good?" retrieval-card":""}">
      <div class="stat-icon"><img src="./assets/${({monitor:"stat-devices",layers:"stat-repositories",database:"stat-content",zap:"stat-retrieval"})[ic]}.webp" alt="" width="54" height="54"></div><div class="stat-info">
        <strong class="stat-label">${esc(label)}</strong>
        <div class="stat-value">${good&&preview?icon("check"):""}${esc(value)}</div>
        <span class="stat-sub">${esc(sub)}</span>
      </div></div>`;
  }
  const panelHeading = (ic,label,to,action) => `<div class="panel-heading">
    <h2>${icon(ic)}${label}</h2>
    <button class="text-link" data-do="${to}">${action} ${icon("arrow-right","small")}</button>
  </div>`;
  function overview() {
    return `<main class="page-content overview-content" id="main-content">
      ${hero()}
      <section class="stats-grid" aria-label="Overview metrics">
        ${stat("monitor","Devices",preview||localSession?"1":"0",preview?"1 online":localSession?"1 local connected":"No paired devices")}
        ${stat("layers","Folders",preview?"3":"0",preview?"1,248 files":"No indexed files")}
        ${stat("database","Indexed Content",preview?"4.6 GB":"0 B",preview?"3 folders":"Not yet indexed")}
        ${stat("zap","Retrieval Ready",preview?"Online":localSession?.capabilities?.search?"Local":"Offline",preview?"MCP available for ChatGPT and Claude":localSession?.capabilities?.search?"Search authorized folders":"Pair an Agent",preview)}
      </section>
      <section class="overview-panels" aria-label="Indexing and activity">
        <div class="panel index-summary">
          ${panelHeading("layers","Indexing Status","folders","View Folders")}<div class="panel-rule"></div>
          <div class="index-summary-body">
            <div class="index-explanation">
              <div class="ring"><img class="ring-image" src="./assets/${preview?"ring-success-reference.webp":"glossy_hourglass_status_badge.webp"}" width="72" height="72" alt=""></div>
              <div><strong>${preview?(demoIndexing?"Indexing 1 folder":"Up to date"):localSession?(localSession.folders||[]).some(g=>g.indexed)?"Local indexes available":"No indexed folders":"Not connected"}</strong>
                <span>${preview?(demoIndexing?"2 folders are ready.<br>dev-speaknow is indexing.":"All folders are indexed<br>and ready for retrieval."):localSession?`${(localSession.folders||[]).filter(g=>g.indexed).length} local indexes ready.<br>${(localSession.folders||[]).length} authorized folders.`:"No verified local index yet.<br>Pair an Agent to begin."}</span></div>
            </div>
            <div class="engine-stack">
              ${["BM25 (Lexical Search)","ripgrep (Content Search)","FractalRAG (Hierarchical RAG)"].map(x=>`
                <div class="engine-row">
                  <span class="mini-check"><img src="./assets/${preview?"ready_status_badge_icon.webp":"lavender_hourglass_unavailable_badge.webp"}" width="20" height="20" alt=""></span>
                  <strong>${x}</strong><span class="mini-ready" ${preview?"":'style="background:#eceef3;color:#5b647e"'}>${preview?"Ready":"Unavailable"}</span>
                </div>`).join("")}
            </div>
          </div>
        </div>
        <div class="panel activity-panel">
          ${panelHeading("clock","Recent Activity","activity","View All")}<div class="panel-rule"></div>
          ${preview?`<div class="activity-list">${demoEvents.map(([ic,label,time])=>`
            <div class="activity-item">${icon(ic,ic==="check"||ic==="monitor"?"activity-green":"")}
              <span>${esc(label)}</span><small>${esc(time)}</small></div>`).join("")}</div>`:
            `<div class="empty-state" style="padding:21px 12px;">${icon("activity")}<strong>No activity yet</strong><p>${localSession?"No local indexing activity is available.":"Verified activity will appear after device pairing."}</p></div>`}
        </div>
      </section>
      <section class="overview-bottom" aria-label="Folders and MCP hosts">
        <div class="panel repos-panel">
          ${panelHeading("folder","Folders","folders","Manage")}
          <table class="repos-table">
            <thead><tr><th>Name</th><th>Location</th><th>Files</th><th>Size</th><th>Status</th></tr></thead>
            <tbody>${preview?demoOverviewFolders.map(([name,path,files,size])=>`<tr>
              <td><img class="repo-folder-img" src="./assets/folder-yellow.webp" width="24" height="23" alt=""><strong class="repo-name">${esc(name)}</strong><small class="overview-folder-owner">Device: ${esc(demoDevice.name)}</small></td>
              <td class="repo-path">${esc(path)}</td><td>${files}</td><td>${size}</td>
              <td><span class="status-pill ${demoIndexing&&name==="dev-speaknow"?"pending":"good"}">${icon(demoIndexing&&name==="dev-speaknow"?"refresh":"check","small")}${demoIndexing&&name==="dev-speaknow"?"Indexing":"Indexed"}</span></td></tr>`).join(""):
              `${localSession?.folders?.length?localSession.folders.map(g=>`<tr><td><strong>${esc(g.name)}</strong></td><td class="repo-path">${esc(g.path)}</td><td>${g.documents||0}</td><td>—</td><td>${g.indexed?"Indexed":"Not indexed"}</td></tr>`).join(""):`<tr><td colspan="5" style="text-align:center;padding:33px 12px;color:#676b86;">No authorized folders. Choose a folder in Folders.</td></tr>`}</tbody>`}</tbody>
          </table>
        </div>
        <div class="panel mcp-panel">
          ${panelHeading("link","MCP Connections","connections","Configure")}<div class="panel-rule"></div>
          <div class="mcp-list">
            ${["ChatGPT","Claude"].map(host=>`<div class="mcp-item">
              <span class="mcp-brand ${host==="ChatGPT"?"chatgpt":"claude"}" aria-hidden="true"><img src="./assets/${host==="ChatGPT"?"mcp-chatgpt.webp":"mcp-claude.webp"}" width="39" height="39" alt=""></span>
              <strong>${host}</strong><span class="status-pill ${preview?"good":"offline"}">
                ${icon(preview?"check":"hourglass","small")}${preview?"Connected":"Not connected"}</span>
              <button class="more-button" data-do="connections" aria-label="${host} connection details">${icon("ellipsis")}</button>
            </div>`).join("")}
          </div>
        </div>
      </section>
    </main>`;
  }
  function folderRow(item,index) {
    const running=item.state==="indexing", draft=item.state==="draft", pending=item.state==="pending";
    const owner=[...demoDevices,...(localSession?[localSession.device]:[])].find(device=>device.id===item.deviceId);
    return `<div class="folder-table-row${running?" in-progress":""}" data-folder="${esc(item.name)}" data-device="${esc(item.deviceId||"")}">
      <div class="folder-path-cell"><span class="small-folder-icon"><img src="./assets/folder-yellow.webp" width="27" height="27" alt=""></span>
        <span class="folder-path-text"><strong title="${esc(item.path)}">${esc(item.path)}</strong>
          <small class="folder-owner">${icon("monitor","small")} Device: ${owner?`<a href="#/devices" title="View ${esc(owner.name)} in Devices">${esc(owner.name)}</a>`:`<span>Unassigned</span>`}</small></span></div>
      <div class="folder-status"><span class="status-pill ${running||pending?"pending":draft?"offline":"good"}">
        ${icon(running?"refresh":draft||pending?"hourglass":"check","small")}${running?"Indexing":draft?"Draft":pending?"Not indexed":"Indexed"}</span></div>
      <div class="folder-docs">${draft||pending?"—":nf(item.count)}</div>
      <div class="engine-chips">${draft||pending?"—":["BM25","ripgrep","FractalRAG"].map(e=>`<span class="engine-chip">${e}</span>`).join("")}</div>
      <div class="last-indexed">${draft?"Not validated":esc(item.indexed)}</div>
      <button class="more-button" data-do="row-menu" data-index="${index}" aria-haspopup="menu" aria-label="Options for ${esc(item.name)}">${icon("ellipsis")}</button>

      ${rowMenu===index?`<div class="row-action-menu" role="menu">
        <button data-do="view-folder" data-index="${index}" role="menuitem">View details</button>
        <button data-do="${draft?"remove-draft":localSession?"index-local-grant":"reindex"}" data-index="${index}" role="menuitem">${draft?"Remove draft":localSession?"Index / Reindex":"Reindex (requires Agent)"}</button>
        ${localSession&&item.id?`<button data-do="revoke-grant" data-grant-id="${esc(item.id)}" role="menuitem">Revoke folder permission</button>`:""}
      </div>`:""}
    </div>`;
  }
  function folders() {
    const requestedDevice=new URLSearchParams(location.hash.split("?")[1]||"").get("device");
    const device=preview?demoDevices.find(item=>item.id===requestedDevice):localSession?.device.id===requestedDevice?localSession.device:null;
    const liveFolders=!preview&&localSession?(localSession.folders||[]).map(g=>({
      id:g.id, name:g.name, path:g.path, deviceId:localSession.device.id,
      state:g.indexed?"indexed":"pending",count:g.documents||0,
      indexed:g.indexed?(g.indexed_at?new Date(g.indexed_at*1000).toLocaleString():"Indexed"):"Not indexed",
      available:g.available
    })):[];
    const list=[...(preview?demoFolders.filter(item=>!device||item.deviceId===device.id):liveFolders),...(!device&&!localSession?drafts().map(path=>({
      name:path.split(/[\\/]/).filter(Boolean).pop()||"Folder draft",
      path,state:"draft",count:0,indexed:"Not validated"
    })):[])];
    const active=list.find(item=>item.state==="indexing");
    return `<main class="page-content folders-content" id="main-content">
      <div class="folders-columns">
        <div class="folders-left">
          <section class="panel add-folder-card" aria-label="Add folder path">
            <span class="form-folder-icon" aria-hidden="true">${icon("folder")}${icon("plus","small")}</span>
            ${localSession&&!preview?`<div class="add-folder-row" style="align-items:center;gap:12px;flex-wrap:wrap;">
              <button class="button primary" data-do="choose-local-folder" ${activeOperation?"disabled":""}>${icon("folder","small")} Choose an authorized folder</button>
              <span style="font-size:12px;color:#565b77;">The native Rust folder picker asks you directly. No browser path grants access.</span></div>`:`<form id="folder-form">
              <label class="field-label" for="folder-path">Folder Path (absolute)
                <span title="Browser-only draft, not access permission">${icon("info","small")}</span>
              </label>
              <div class="add-folder-row">
                <div class="path-input-wrap">${icon("folder")}
                  <input id="folder-path" name="path" type="text" maxlength="1024" required
                    spellcheck="false" autocomplete="off" placeholder="e.g. D:\\Documents\\Knowledge"
                    aria-describedby="folder-help">
                </div>
                <button class="button primary" type="submit">${icon("plus")} Add Folder</button>
              </div>
              <span class="sr-only" id="folder-help">Absolute Windows, network or POSIX directory. The preview stores drafts only and does not grant access.</span>
              <div id="folder-error" class="field-error" hidden></div>
            </form>`}
          </section>
          ${device?`<div class="folder-device-filter">${icon("monitor","small")} Showing folders on <strong>${esc(device.name)}</strong><span>${preview?"Sample device • preview":"Local development session"}</span><a href="#/folders">All devices ${icon("close","small")}</a></div>`:""}
          <div class="section-title-row">
            <h2>${device?"Device Folders":"All Folders"}</h2><span class="sr-only">${list.length} folders in this view</span>
            <div class="folders-table-actions"><button class="text-link" data-do="reindex">${icon("refresh","small")} Refresh</button>
</div>
          </div>
          <section class="panel folder-table-panel" aria-label="Folders list">
            <div class="folder-table-head"><div>Folder / Device</div><div>Status</div><div>Documents</div><div>Engines</div><div>Last Indexed</div><div></div></div>
            ${list.length?list.map(folderRow).join(""):`<div class="empty-state">${icon("folder")}
              <strong>No folders</strong>
              <p>${localSession?"Use Choose an authorized folder above to open the native folder picker.":"Add a browser-only folder draft above. A paired RAGO Agent is required to authorize and index its contents."}</p></div>`}
          </section>
          ${active?`<section class="panel indexing-progress-panel" aria-label="Illustrative indexing progress for ${esc(active.name)}">
            <div class="panel-heading"><h2>${icon("layers")}Indexing ${esc(active.name)}</h2>
              <button class="text-link" data-do="progress-detail">View Details ${icon("arrow-right","small")}</button></div>
            <div class="panel-rule"></div>
            <div class="progress-head">
              <span class="progress-icon"><img src="./assets/folder-yellow.webp" width="40" height="40" alt=""></span>
              <div class="progress-heading"><strong>${esc(active.path)}</strong><span>Indexing documents …</span></div>
              <strong class="progress-percent">${active.percent}%</strong>
              <div class="progress-metrics">
                <div class="progress-metric">${icon("file")}<div><strong>${nf(active.count)}</strong><span>Documents</span></div></div>
                <div class="progress-metric">${icon("database")}<div><strong>814 MB</strong><span>Processed</span></div></div>
                <div class="progress-metric">${icon("clock")}<div><strong>~3 min</strong><span>Remaining</span></div></div>
              </div>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${active.percent}%"></div></div>
          </section>`:""}
        </div>
        <div class="folders-right">
          <aside class="panel how-card" aria-label="How it works">
            <h2>${icon("play")} How It Works</h2>
            <div class="steps">
              <div class="step"><span class="step-index">1</span><div class="step-copy"><strong>Add a folder</strong><p>Choose an authorized local folder path.</p></div></div>
              <div class="step"><span class="step-index">2</span><div class="step-copy"><strong>Index that folder</strong>
                <p>The RAGO Agent scans and builds indexes using BM25, ripgrep and FractalRAG.</p>
              </div></div>
              <div class="step"><span class="step-index">3</span><div class="step-copy"><strong>Keep it up to date</strong>
                <p>Changes are detected and automatically re-indexed after authorization.</p>
              </div></div>
            </div>
          </aside>
          <aside class="panel about-card" aria-label="About retrieval">
            <h2>${icon("layers")} About Retrieval</h2>
            <p class="about-intro">RAGO combines three complementary retrieval engines to deliver comprehensive, high-quality results for your local knowledge.</p>
            <div class="about-lines">
              <div class="about-line">${icon("database")}<span><strong>BM25</strong><small>Lexical search for fast, relevant matching based on term statistics.</small></span></div>
              <div class="about-line">${icon("search")}<span><strong>ripgrep</strong><small>High-performance content search across large code and text folders.</small></span></div>
              <div class="about-line">${icon("layers")}<span><strong>FractalRAG</strong><small>Hierarchical retrieval for multi-level, context-aware understanding of your documents.</small></span></div>
            </div>
          </aside>
        </div>
      </div>
    </main>`;
  }

  function searchPage() {
    if(!localSession||preview)return placeholder("search");
    const results=searchResults?.results||[];
    return `<main id="main-content" class="page-content placeholder-page">
      <div class="placeholder-head"><span class="stat-icon">${icon("search")}</span>
        <div><h1>Local Search</h1><p>Search only your authorized, locally indexed folders.</p></div>
      </div>
      <section class="panel placeholder-card">
        <h2>${icon("search","small")} Search local knowledge</h2>
        <form id="local-search-form" style="display:grid;gap:12px;margin:16px 0;">
          <label for="local-search-input" class="field-label">What would you like to find?</label>
          <div class="add-folder-row"><div class="path-input-wrap">${icon("search","small")}
            <input id="local-search-input" type="search" maxlength="512" required
              placeholder="Find information in approved folders…" value="${esc(searchQuery)}"></div>
            <button class="button primary" type="submit" ${activeOperation?"disabled":""}>${icon("search","small")} Search</button>
          </div>
        </form>
        ${searchResults?`<p style="margin:8px 0;color:#636681;">${results.length} matching documents • ${esc((searchResults.engines||[]).join(", "))}</p>
          <div style="display:grid;gap:12px;">${results.length?results.map(hit=>`
            <article class="panel" style="padding:16px;border:1px solid #dddaf0;border-radius:12px;">
              <strong style="display:block;overflow-wrap:anywhere;">${esc(hit.path)}</strong>
              <small>${esc(hit.engine)} • Source grant ${esc(String(hit.grant_id).slice(0,8))}</small>
              <p style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;">${esc(hit.snippet)}</p>
            </article>`).join(""):`<div class="empty-state">${icon("search")}<strong>No matches found</strong><p>Try another query or index an authorized folder.</p></div>`}</div>`:
          `<p>Search runs locally. No files or indexes are uploaded to RAGO cloud services.</p>`}
      </section>
    </main>`;
  }
  function mcpPage() {
    if(!localSession||preview)return placeholder("connections");
    const enabled=!!localSession.capabilities?.mcp;
    const conf=JSON.stringify({mcpServers:{"rago-local":{
      command:localSession.mcp_command||"rago",
      args:["--mcp-stdio"]
    }}},null,2);
    return `<main id="main-content" class="page-content placeholder-page">
      <div class="placeholder-head"><span class="stat-icon">${icon("link")}</span>
        <div><h1>Local MCP</h1><p>Allow a local harness such as Antigravity to search authorized folders.</p></div>
      </div>
      <section class="panel placeholder-card">
        <h2>${icon("shield-check","small")} Local MCP access</h2>
        <p>The Rust RAGO executable itself serves MCP over stdio. No relay or Siglet login is required.</p>
        <p><strong>Status:</strong> <span class="status-pill ${enabled?"good":"offline"}">${enabled?"Enabled":"Disabled"}</span></p>
        <p><strong>Device:</strong> ${esc(localSession.device?.name||"Unknown device")} • LLM chooses among these scoped MCP tools:</p>
        <ul style="margin:0 0 12px 22px;line-height:1.8;">
          <li><code>rago_search_bm25</code> — ranked lexical retrieval</li>
          <li><code>rago_search_fractal</code> — offline FractalRAG retrieval</li>
          <li><code>rago_search_rg</code> — literal/regex search</li>
          <li><code>rago_list_folders</code> / <code>rago_reindex</code> — existing grants only</li>
        </ul>
        <p style="font-size:12px;">Search tools require <code>device_name</code> + an absolute <code>path</code> under a human-approved grant. Neither parameter grants access.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;">
          <button class="button ${enabled?"secondary":"primary"}" data-do="mcp-toggle" ${activeOperation?"disabled":""}>
            ${enabled?"Disable local MCP":"Enable local MCP"}</button>
        </div>
        <p style="margin-top:15px;">Google Antigravity → MCP Servers → Manage → View raw config; add this server to mcp_config.json, then refresh MCP servers:</p>
        <pre id="mcp-config" style="white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;border:1px solid #dddaf0;border-radius:10px;background:#f7f6fd;">${esc(conf)}</pre>
        <button class="button secondary" data-do="mcp-copy">${icon("copy","small")} Copy MCP config</button>
        <p style="font-size:12px;margin-top:12px;">Antigravity launches the same native Rust MCP process. Host requests cannot create folder permissions. Disabling MCP prevents subsequent MCP tool calls.</p>
      </section>
    </main>`;
  }
  const other = {
    connections:["link","MCP Connections","Manage ChatGPT and Claude authorizations.","No live connections","Host grants must be approved independently. This preview has none."],
    search:["search","Local Search","Search only approved local folders.","Connect Local Agent","Local search requires a paired on-device Rust Agent."],
    activity:["activity","Activity","Device and host activity.","No verified activity","This CDN-only page is not connected to an audit service."],
    settings:["settings","Settings","Configure workspace and account preferences.","No verified settings","Device authority and folder access remain under their respective owners."],
    help:["help","Help","RAGO setup and security.","Local-first knowledge","RAGO indexes on the device. Authorized AI hosts can receive bounded search evidence."],
    "not-found":["info","Page not found","The requested page does not exist.","This page is unavailable","Use Folders to manage sources and view indexing progress, or return to Overview."]
  };
  const localLaunchCommand=()=>"npx --yes @human-agent/rago@0.4.0 --require-bundle";
  function addDevice() {
    const command=localLaunchCommand();
    const steps=["Choose connection","Run the Agent","Pair device"];
    return `<main class="page-content setup-content" id="main-content">
      <header class="setup-intro"><h1>Add your Device</h1><p>Connect a RAGO Agent in a few simple steps. Your documents stay on your device.</p></header>
      <ol class="setup-steps" aria-label="Device setup progress">${steps.map((step,i)=>`<li class="${setupStep===i+1?"current":setupStep>i+1?"complete":""}" ${setupStep===i+1?'aria-current="step"':""}><span>${i+1}</span>${step}</li>`).join("")}</ol>
      ${setupStep===1?`<section class="panel setup-panel">
        <h2>How would you like to connect?</h2>
        <div class="setup-choices">
          <div class="setup-choice selected"><span class="setup-choice-icon">${icon("monitor")}</span><div><strong>Local</strong><span class="setup-badge ready">No account needed</span><p>Search and index on this device. Local MCP works without Siglet or relay.<br><b class="setup-url">${localEndpoint}</b></p></div></div>
          <div class="setup-choice"><span class="setup-choice-icon">${icon("link")}</span><div><strong>Remote</strong><a class="setup-badge pending" href="#/online">Register with Siglet</a><p>Use your local RAGO Agent from anywhere through<br><b class="setup-url">https://rago.siglet.app/mcp</b></p></div></div>
        </div>
        <p class="setup-note">Local mode never requires an account. Your files and indexes stay on this device.</p>
        <div class="setup-actions"><button type="button" class="button primary" data-do="setup-next">Continue with Local ${icon("arrow-right","small")}</button><a href="#/devices" class="button secondary">Back to Devices</a></div>
      </section>`:setupStep===2?`<section class="panel setup-panel">
        <h2>Run the local RAGO Agent</h2>
        <p>Run RAGO on Windows x64, macOS (Intel or Apple Silicon), or Linux (x64 or ARM64).</p>
        <div class="setup-platforms"><strong>Windows x64</strong><span>macOS x64 / ARM64</span><span>Linux x64 / ARM64</span></div>
        <ol class="setup-instructions"><li>Install Node.js 20 or later to use npm/npx.</li><li>Copy and run this command in your terminal.</li><li>Keep the Agent running and use its one-time pairing code.</li></ol>
        <div class="setup-terminal"><code id="setup-command">${esc(command)}</code><button type="button" class="button small" data-do="setup-copy">${icon("file","small")} Copy command</button></div>
        <p class="setup-note">The first download requires Internet. Once installed, Local RAG works without an account or relay.</p>
        <div class="setup-actions"><button type="button" class="button primary" data-do="setup-next">I started the Agent ${icon("arrow-right","small")}</button><button type="button" class="button secondary" data-do="setup-back">Back</button></div>
      </section>`:`<section class="panel setup-panel">
        <h2>Pair your local device</h2>
        <p>The Agent prints a one-time 64-character code in its terminal. Paste that code below to connect this browser.</p>
        ${preview?`<div class="setup-note">Design Preview is active. Switch to live mode to pair with an actual local Agent.</div><div class="setup-actions"><a class="button primary" href="./index.html?preview=0#/add-device">Open live mode</a><button type="button" class="button secondary" data-do="setup-back">Back</button></div>`:
        `<form id="local-connect-form" class="local-connect-form">
          <label for="local-token">One-time pairing code</label><input id="local-token" type="password" autocomplete="off" spellcheck="false" maxlength="256" required placeholder="64-character code from your RAGO terminal">
          <p id="local-connect-error" class="local-connect-error" role="alert" hidden></p>
          <div class="setup-actions"><button class="button primary" type="submit">Connect Local Agent</button><button class="button secondary" type="button" data-do="setup-back">Back</button></div>
        </form>`}
        <p class="setup-note">The code expires after 10 minutes. Pairing does not grant filesystem access; approve folders separately.</p>
      </section>`}
    </main>`;
  }
  function onlinePage() {
    const disabled=remoteBusy?" disabled":"";
    const credential=remoteCredential;
    const credentialPanel=credential?`<section class="remote-credential" aria-label="New credential">
          <h2>${credential.kind==="device"?"Start the Agent":"Configure your MCP host"}</h2>
          ${credential.kind==="device"?`<p>Run this command on the device, then paste the credential into the running Agent and press Enter. Use a private terminal as the credential may be visible while pasting.</p><pre><code>npx --yes @human-agent/rago@0.4.0 --remote ${esc(credential.id)}</code></pre>`:`<p>Set this credential as the Bearer token for <code>https://rago.siglet.app/mcp</code> in your MCP host.</p>`}
          <p>Copy this credential now. RAGO only shows it here once.</p>
          <div class="setup-actions"><button class="button primary" data-do="remote-copy">Copy credential</button><button class="button secondary" data-do="remote-dismiss">I’ve saved it</button></div>
        </section>`:"";
    return `<main class="page-content setup-content" id="main-content">
      <div class="setup-intro"><p>Use your RAGO Agent from anywhere through <code>https://rago.siglet.app/mcp</code>.</p></div>
      <p role="alert" class="remote-error">${esc(remoteError)}</p>
      ${location.origin!=="https://rago.siglet.app"||preview?'<section class="panel setup-panel"><a href="https://rago.siglet.app/#/online">Open RAGO Remote Devices</a></section>':remoteSignedOut?`<section class="panel setup-panel"><h2>Connect with Siglet</h2><p>Sign in to register a device and manage access for your MCP host.</p><a class="button primary" href="/login/siglet">Continue with Siglet</a></section>`:remoteDevices===null?`<section class="panel setup-panel"><p role="status">${remoteBusy?"Checking your Siglet session…":"Unable to verify your session."}</p><button class="button secondary" data-do="remote-refresh"${disabled}>Try again</button>${credentialPanel}</section>`:`
      <section class="panel setup-panel remote-panel">
        <div class="setup-actions">
          <button class="button primary" data-do="remote-enroll"${disabled}>Register device</button>
          <button class="button secondary" data-do="remote-refresh"${disabled}>Refresh status</button>
          <button class="button secondary" data-do="remote-logout"${disabled}>Sign out of RAGO</button>
        </div>
        ${remoteBusy?'<p role="status">Working…</p>':remoteDevices?.length===0?'<p>No remote devices registered.</p>':""}
        ${credentialPanel}
        ${remoteDevices?.map(device=>`<article class="remote-device">
          <h2>Device <code>${esc(device.device_id)}</code></h2>
          <p><strong>${device.connected?"Connected":"Offline"}</strong></p>
          ${device.host_grant?`<p>Host <strong>${esc(device.host_grant.host)}</strong> has access to <code>${esc(device.host_grant.path)}</code> on <strong>${esc(device.host_grant.device_name)}</strong>.</p>
            <button class="button secondary" data-do="remote-revoke-host" data-id="${esc(device.device_id)}"${disabled}>Revoke host access</button>`:'<p>No host access granted.</p>'}
          <form class="remote-grant" data-remote-grant data-id="${esc(device.device_id)}">
            <label>Host name<input name="host" maxlength="128" required placeholder="My MCP client"></label>
            <label>Agent device name<input name="device_name" maxlength="255" required placeholder="WORKSTATION"></label>
            <label>Absolute folder path<input name="path" maxlength="4096" required placeholder="C:\\Documents"></label>
            <p>Use the exact name and folder path the host will request. Approve the folder in the local Agent first.</p>
            <button class="button primary"${disabled}>${device.host_grant?"Replace host grant":"Grant host access"}</button>
          </form>
          <button class="button secondary" data-do="remote-revoke-device" data-id="${esc(device.device_id)}"${disabled}>Remove device</button>
        </article>`).join("")??""}
        <form class="remote-grant" data-remote-track>
          <label>Existing device ID<input name="id" maxlength="22" pattern="[A-Za-z0-9_\\-]{22}" required></label>
          <button class="button secondary"${disabled}>Add existing device to this list</button>
        </form>
      </section>`}
    </main>`;
  }

  async function onlineRequest(path="", method="GET", data) {
    const response=await fetch(onlineEndpoint+path,{
      method, credentials:"same-origin", cache:"no-store",
      headers:data?{"Content-Type":"application/json"}:undefined,
      body:data?JSON.stringify(data):undefined
    });
    if(response.status===401){
      remoteSignedOut=true;
      remoteDevices=null;
      remoteCredential=null;
      throw new Error("Sign in with Siglet to continue.");
    }
    if(!response.ok)throw new Error({
      400:"Check the device ID and host grant fields.",
      403:"The request was denied.",
      404:"This device is unavailable in your Siglet account.",
      409:"Device limit reached. Remove a device before registering another.",
    }[response.status]||"RAGO Online is temporarily unavailable.");
    return response.status===204?null:response.json();
  }

  async function remoteWork(task) {
    if(remoteBusy||preview||location.origin!=="https://rago.siglet.app"||(task&&remoteDevices===null))return;
    remoteBusy=true;
    remoteError="";
    if(route()==="online")render();
    try {
      if(task)await task();
      remoteDevices=(await onlineRequest()).devices;
      remoteSignedOut=false;
    }catch(error){
      remoteError=error.message||"Could not reach RAGO Online.";
      remoteDevices=null;
    }finally{
      remoteBusy=false;
      if(route()==="online")render();
      else remoteCredential=null;
    }
  }

  async function remoteLogout() {
    if(remoteBusy||preview||location.origin!=="https://rago.siglet.app"||remoteDevices===null)return;
    remoteBusy=true;
    remoteError="";
    render();
    try {
      const response=await fetch("/logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error("Could not sign out. Try again.");
      remoteDevices=null;
      remoteCredential=null;
      remoteSignedOut=true;
    }catch(error){
      remoteError=error.message||"Could not sign out.";
    }finally{
      remoteBusy=false;
      if(route()==="online")render();
    }
  }

  function devices() {
    const realDevice=!preview?localSession?.device:null;
    const shownDevices=realDevice?[realDevice]:demoDevices;
    const hasDevices=shownDevices.length>0;
    const folderCount=demoFolders.filter(folder=>folder.deviceId===demoDevice.id).length;
    const indexingCount=demoFolders.filter(folder=>folder.deviceId===demoDevice.id&&folder.state==="indexing").length;
    return `<main class="page-content devices-content" id="main-content">
      <section class="devices-intro">
        <span class="devices-title-icon" aria-hidden="true">${icon("monitor")}</span>
        <div><h1>Your Devices</h1><p>RAGO Agents provide controlled access to folders on their own device.</p></div>
        <a class="button secondary" href="#/online">Remote Devices</a>
        <a class="button primary devices-add-link" href="#/add-device">${icon("plus","small")} Add your Device</a>
      </section>
      <div class="devices-layout">
        <section class="panel devices-list-panel" aria-label="Paired devices">
          <div class="devices-list-heading">
            <h2>${hasDevices?"Connected Devices":"Devices"}</h2>
            <span class="devices-count">${hasDevices?(realDevice?"1 local device":"1 sample device"):"0 connected"}</span>
          </div>
          ${hasDevices?shownDevices.map(device=>`<article class="device-card" data-device="${esc(device.id)}">
            <div class="device-card-top">
              <span class="device-computer" aria-hidden="true">${icon("monitor")}</span>
              <div class="device-identity"><h3>${esc(device.name)}</h3>
                <p>${esc(device.agent)} • ${esc(device.platform)} • ${realDevice?"local development":"sample device"}</p></div>
              <span class="status-pill good">${icon("check","small")} ${realDevice?"Local session":"Online • preview"}</span>
            </div>
            <div class="device-facts">
              <div><span>Folders</span><strong>${realDevice?(localSession.folders||[]).length:folderCount}</strong></div>
              <div><span>Indexing</span><strong>${realDevice?`${(localSession.folders||[]).filter(g=>g.indexed).length} indexed`:indexingCount?indexingCount+" in progress":"Up to date"}</strong></div>
              <div><span>Last seen</span><strong>${realDevice?"Verified this session":"Just now (sample)"}</strong></div>
            </div>
            <div class="device-card-actions">
              <a class="button primary" href="#/folders?device=${encodeURIComponent(device.id)}">${icon("folder","small")} View Folders</a>
              ${realDevice?`<button class="button secondary" data-do="disconnect-local">${icon("close","small")} Disconnect local</button>`:`<button class="button secondary" data-do="device-pairing-info">${icon("info","small")} About device access</button>`}
            </div>
          </article>`).join(""):`<div class="device-empty" role="status">
            <span class="device-empty-icon" aria-hidden="true">${icon("monitor")}</span>
            <h3>No devices paired</h3>
            <p>Connect a device running RAGO Agent to make its authorized folders available for indexing.</p>
            <div class="local-connect-actions"><a class="button primary" href="#/add-device">${icon("plus","small")} Add your Device</a><button class="button secondary" data-do="connect-local">${icon("link","small")} Connect Local Agent</button></div>
          </div>`}
        </section>
        <aside class="panel devices-guide" aria-label="How devices and folders work">
          <h2>${icon("layers")} How Devices &amp; Folders Work</h2>
          <ol>
            <li><strong>Connect a device</strong><span>Run RAGO Agent and complete verified device pairing.</span></li>
            <li><strong>Authorize its folders</strong><span>Each folder belongs to one device. Browser paths alone grant no access.</span></li>
            <li><strong>Index on that device</strong><span>Progress belongs to the folder and appears while a job runs.</span></li>
          </ol>
          <div class="devices-guide-note">${icon("info","small")} ${realDevice?"Local-only RAGO: choose approved folders on this device, index and search without relay.":"This static portal cannot pair devices or inspect local files."}</div>
        </aside>
      </div>
    </main>`;
  }
  function placeholder(page) {
    const [ic,title,subtitle,empty,description]=other[page]||other.help;
    return `<main id="main-content" class="page-content placeholder-page">
      <div class="placeholder-head"><span class="stat-icon">${icon(ic)}</span>
        <div><h1>${title}</h1><p>${subtitle}</p></div>
      </div>
      <section class="panel placeholder-card">
        <h2>${empty}</h2><p>${description}</p>
        <div class="notice">${icon("info","small")} Static frontend only — no backend, account session or local Agent has been connected.</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;">
          <a class="button primary" href="#/folders">${icon("folder","small")} Folders</a>
          <a class="button secondary" href="#/overview">${icon("home","small")} Overview</a>
        </div>
      </section>
    </main>`;
  }
  function modalHTML() {
    if(!overlay)return "";
    let part="";
    if(overlay==="add-draft") part=`<h2>Save folder path draft</h2>
      <p>Path: <strong style="overflow-wrap:anywhere;color:#27214d">${esc(pendingPath)}</strong></p>
      <p>Saving this draft does <strong>not</strong> grant access to the local folder, validate a path or start indexing.</p>
      <label class="checkbox-line"><input type="checkbox" id="draft-ok">
        I understand this is a browser-only draft, not a device permission.</label>
      <div class="modal-actions">
        <button class="button secondary" data-do="close-modal">Cancel</button>
        <button class="button primary" data-do="save-draft">Save draft</button>
      </div>`;
    else if(overlay.startsWith("remove:")){
      const i=Number(overlay.split(":")[1])-(preview?demoFolders.length:0);
      part=`<h2>Remove browser draft?</h2><p>${esc(drafts()[i]||"")}</p>
        <p>This will remove only the local draft. No device permissions exist in this preview.</p>
        <div class="modal-actions"><button class="button secondary" data-do="close-modal">Cancel</button>
          <button class="button primary" data-do="confirm-remove" data-index="${i}">Remove draft</button></div>`;
    }
    else if(overlay==="how") part=`<h2>How RAGO works</h2>
      <p>1. Pair a local RAGO Agent.<br>2. Authorize specific folders on that device.<br>
      3. Index documents with BM25, ripgrep and FractalRAG.<br>
      4. Authorize ChatGPT or Claude independently to retrieve evidence using MCP.</p>
      <p>Device pairing, indexing, SSO and MCP are not implemented by this frontend-only preview.</p>
      <div class="modal-actions"><button class="button primary" data-do="close-modal">Got it</button></div>`;
    else if(overlay==="citations") part=`<h2>Source citations</h2>
      <p>Verified evidence may cite a PDF page, Word heading, line or original source location.
      This preview does not fabricate real citation spans.</p>
      <div class="modal-actions"><button class="button primary" data-do="close-modal">Close</button></div>`;
    else if(overlay==="connect-local") part=`<h2>Connect to Local Agent</h2>
      <p>Run the native Rust RAGO local package (or <strong>npm run local:dev</strong> in the source folder). Paste the one-time pairing code printed in its terminal.</p>
      <p>The code expires after 10 minutes. Only <strong>127.0.0.1:47743</strong> is contacted. Local Folder Grants, indexing/search and optional MCP are available; remote relay stays off.</p>
      <form id="local-connect-form" class="local-connect-form">
        <label for="local-token">One-time pairing code</label>
        <input id="local-token" type="password" autocomplete="off" spellcheck="false" maxlength="256" required placeholder="Paste the code from your RAGO terminal">
        <p id="local-connect-error" class="local-connect-error" role="alert" hidden></p>
        <div class="modal-actions"><button class="button secondary" type="button" data-do="close-modal">Cancel</button>
          <button class="button primary" type="submit">Connect Local Agent</button></div>
      </form>`;
    else if(overlay==="revoke-grant"&&pendingGrant) part=`<h2>Revoke folder access?</h2>
      <p>RAGO will immediately remove its permission and delete the indexed local corpus for this grant.</p>
      <div class="modal-actions"><button class="button secondary" data-do="close-modal">Cancel</button>
        <button class="button primary" data-do="confirm-revoke-grant">Revoke permission</button></div>`;
    else if(overlay==="device-pairing-info") part=`<h2>Connect a RAGO device</h2>
      <p>Install and run RAGO Agent on the intended device. Pair it through a verified, authenticated control plane, then authorize specific folders on that device.</p>
      <p>This is a static design preview: it cannot pair a device, grant filesystem permission or start indexing.</p>
      <div class="modal-actions"><button class="button primary" data-do="close-modal">Got it</button></div>`;
    else if(overlay==="progress-detail") part=`<h2>Indexing preview details</h2>
      <p>The progress, counts and duration on the preview screen are illustrative fixtures, not measured Agent data.</p>
      <div class="modal-actions"><button class="button primary" data-do="close-modal">Close</button></div>`;
    else part=`<h2>Preview only</h2><p>No live Agent, device, MCP or provider action is available in this static frontend.</p>
      <div class="modal-actions"><button class="button primary" data-do="close-modal">Close</button></div>`;
    return `<div class="backdrop" data-do="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="RAGO action">
      <button class="modal-close" data-do="close-modal" aria-label="Close">${icon("close")}</button>${part}</section></div>`;
  }
  function render() {
    const page=route();
    document.body.className=page==="folders"?"view-folders":"view-overview";
    document.title=`RAGO Knows Best — ${routes[page]??"Page not found"}`;
    app.innerHTML=`<div class="app-shell${drawer?" drawer-open":""}">
      <div class="mobile-shade" data-do="close-drawer"></div>${sidebar(page)}
      <div class="main-shell">${topbar(page)}
        ${page==="overview"?overview():page==="folders"?folders():page==="devices"?devices():page==="add-device"?addDevice():page==="online"?onlinePage():page==="search"?searchPage():page==="connections"&&localSession&&!preview?mcpPage():placeholder(page)}
      </div>${modalHTML()}
    </div>`;
    if(page==="folders") {
      const left=app.querySelector(".folders-left");
      const progress=left?.querySelector(".indexing-progress-panel");
      const table=left?.querySelector(".folder-table-panel");
      const title=left?.querySelector(".section-title-row");
      if(left && progress && table) left.insertBefore(progress,table);
      if(title && table) table.prepend(title);
    }
    if(overlay==="connect-local")app.querySelector("#local-token")?.focus({preventScroll:true});
    else if(overlay)app.querySelector(".modal-close")?.focus({preventScroll:true});
  }
  function toast(message) {
    document.querySelector(".toast")?.remove();
    const el=document.createElement("div");el.className="toast";el.setAttribute("role","status");
    el.textContent=message;document.body.append(el);
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),4200);
  }
  function stopHeartbeat() {
    if(heartbeatTimer)clearInterval(heartbeatTimer);
    heartbeatTimer=0;
  }
  async function checkLocalSession() {
    if(activeOperation)return;
    const session=localSession;
    if(!session?.access_token)return;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4500);
    try {
      const response=await fetch(localEndpoint+"/v1/session",{method:"GET",mode:"cors",cache:"no-store",
        headers:{"Authorization":"Bearer "+session.access_token},signal:controller.signal});
      if(!response.ok)throw new Error("Session expired or revoked.");
      const data=await response.json();
      if(data.schema!==2||data.mode!=="local")throw new Error("Invalid Local Agent session.");
      if(localSession===session&&(JSON.stringify(data.folders)!==JSON.stringify(session.folders)||
         JSON.stringify(data.capabilities)!==JSON.stringify(session.capabilities))){
        localSession={...data,access_token:session.access_token};render();
      }
    } catch {
      if(localSession===session){stopHeartbeat();localSession=null;searchResults=null;searchQuery="";render();toast("Local Agent disconnected or session expired.");}
    } finally {clearTimeout(timeout);}
  }
  async function disconnectLocal() {
    const session=localSession;
    if(!session?.access_token)return;
    stopHeartbeat();
    localSession=null;searchResults=null;searchQuery="";overlay=null;render();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4500);
    try {
      const response=await fetch(localEndpoint+"/v1/disconnect",{method:"POST",mode:"cors",cache:"no-store",
        headers:{"Authorization":"Bearer "+session.access_token},signal:controller.signal});
      if(!response.ok)throw new Error("Server did not confirm revocation.");
      toast("Local session revoked. Check the terminal for a new pairing code.");
    } catch {
      toast("Browser session cleared. Restart the Agent to revoke its old session if still running.");
    } finally {clearTimeout(timeout);}
  }
  async function connectLocal() {
    const field=document.getElementById("local-token");
    const token=field?.value.trim()||"";
    const error=document.getElementById("local-connect-error");
    const submit=document.querySelector("#local-connect-form button[type=submit]");
    if(!/^[0-9a-fA-F]{64}$/.test(token)){error.textContent="Enter the 64-character code from the RAGO terminal.";error.hidden=false;return;}
    submit.disabled=true;
    error.hidden=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4500);
    try {
      const response=await fetch(localEndpoint+"/v1/pair",{method:"POST",mode:"cors",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({code:token}),signal:controller.signal});
      if(!response.ok){
        const reason=response.status===401?"Pairing code was not accepted.":
          response.status===410?"Pairing code expired or already used. Restart the Agent or disconnect the existing session.":
          response.status===429?"Too many attempts. Try again later.":"Local Agent returned HTTP "+response.status;
        throw new Error(reason);
      }
      const session=await response.json();
      if(session.schema!==2||session.mode!=="local"||!session.device||
         typeof session.device.id!=="string"||!Array.isArray(session.folders)||
         typeof session.capabilities?.indexing!=="boolean"||!(/^[0-9a-f]{64}$/).test(session.access_token))
        throw new Error("Unsupported Local Agent response.");
      localSession=session;
      searchResults=null;searchQuery="";
      field.value="";
      overlay=null;
      stopHeartbeat();
      heartbeatTimer=setInterval(checkLocalSession,15000);
      if(route()==="add-device")location.hash="#/devices";
      render();
      toast("Local Agent authenticated. You can choose folders and enable local MCP.");
    } catch(err) {
      const message=err?.name==="AbortError"?"Local Agent did not respond. Check the terminal.":
        (err instanceof TypeError?"Cannot reach Local Agent. Start npm run local:dev first.":err.message);
      if(error){error.textContent=message;error.hidden=false;}
    } finally {
      clearTimeout(timeout);
      if(submit.isConnected)submit.disabled=false;
    }
  }

  async function nativeRequest(endpoint, payload=null, timeoutMs=120000) {
    const session=localSession;
    if(!session?.access_token)throw new Error("Connect Local Agent first.");
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try {
      const response=await fetch(localEndpoint+endpoint,{
        method:payload===null?"GET":"POST",
        mode:"cors",cache:"no-store",
        headers:{
          "Authorization":"Bearer "+session.access_token,
          ...(payload===null?{}:{"Content-Type":"application/json"})
        },
        ...(payload===null?{}:{body:JSON.stringify(payload)}),
        signal:ctrl.signal
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.detail||data.error||"Agent request failed.");
      return data;
    } finally {clearTimeout(timer);}
  }
  async function refreshLocalData() {
    const session=localSession;
    if(!session)return;
    const data=await nativeRequest("/v1/session");
    if(localSession===session){
      localSession={...data,access_token:session.access_token};
      render();
    }
  }
  async function localWork(task,success) {
    if(activeOperation)return;
    activeOperation=true;
    try{
      const data=await task();
      if(localSession)await refreshLocalData();
      if(success)toast(success(data));
      return data;
    }catch(error){
      toast(error?.name==="AbortError"?"RAGO operation timed out. Check the Agent.":"RAGO: "+(error?.message||error));
      return null;
    }finally{activeOperation=false;}
  }
  async function grantNativeFolder() {
    toast("Choose a folder in the native RAGO dialog. You can cancel without granting access.");
    await localWork(()=>nativeRequest("/v1/folders/select",{},300000),data=>
      data.cancelled?"Folder selection cancelled.":"Folder permission granted. Click Index / Reindex.");
  }
  function grantAtIndex(index) {
    const grants=localSession?.folders||[];
    return grants[index]?.id||null;
  }
  async function localIndex(id) {
    if(!id)return toast("No authorized folder selected.");
    toast("Indexing authorized local files. This may take a while.");
    await localWork(()=>nativeRequest("/v1/folders/index",{grant_id:id},180000),
      data=>`Indexed ${data.documents} local text documents. ${data.skipped} skipped.`);
  }
  async function toggleMcp() {
    const enabling=!localSession?.capabilities?.mcp;
    await localWork(()=>nativeRequest("/v1/mcp",{enabled:enabling}),
      ()=>enabling?"Local MCP enabled. Configure Antigravity with the command shown.":"Local MCP disabled for all future tool calls.");
  }
  async function queryLocal() {
    const query=document.getElementById("local-search-input")?.value.trim()||"";
    if(!query)return;
    searchQuery=query;
    const result=await localWork(()=>nativeRequest("/v1/search",{query,max_results:10},120000));
    if(result){searchResults=result;render();}
  }
  const isAbsolute=path=>
    (/^[a-zA-Z]:[\\/][^<>|"*?\u0000-\u001f]*$/.test(path) ||
     /^\\\\[^\\/\s]+\\[^\\/\s]+(?:\\[^<>|"*?\u0000-\u001f]*)?$/.test(path) ||
     /^\/(?!\/)[^\u0000-\u001f]*$/.test(path));

  document.addEventListener("submit",e=>{
    const form=e.target;
    if(form.matches?.("[data-remote-grant], [data-remote-track]")){
      e.preventDefault();
      const fields=Object.fromEntries(new FormData(form));
      if(form.hasAttribute("data-remote-track")){
        remoteWork(()=>onlineRequest("/"+encodeURIComponent(fields.id)+"/track","POST"));
      }else if(!isAbsolute(fields.path)){
        remoteError="Enter an absolute Windows, UNC or POSIX folder path.";
        form.closest("main").querySelector(".remote-error").textContent=remoteError;
      }else{
        const id=form.dataset.id;
        const current=remoteDevices?.find(device=>device.device_id===id);
        if(current?.host_grant&&!window.confirm("Replace the current host grant and invalidate its credential?"))return;
        if(remoteCredential&&!window.confirm("Discard the credential currently shown?"))return;
        remoteWork(async()=>{
          const result=await onlineRequest("/"+encodeURIComponent(id)+"/host","POST",fields);
          remoteCredential={id,kind:"host",token:result.host_token};
        });
      }
      return;
    }
    if(e.target.id==="local-connect-form"){e.preventDefault();connectLocal();return;}
    if(e.target.id==="local-search-form"){e.preventDefault();queryLocal();return;}
    if(e.target.id!=="folder-form")return;
    e.preventDefault();
    const value=document.getElementById("folder-path").value.trim();
    const error=document.getElementById("folder-error");
    if(!value||value.length>1024||!isAbsolute(value)){
      error.textContent="Enter an absolute Windows, UNC or POSIX folder path.";error.hidden=false;return;
    }
    if(drafts().some(p=>p.toLowerCase()===value.toLowerCase())){
      error.textContent="That path is already saved as a draft.";error.hidden=false;return;
    }
    pendingPath=value;overlay="add-draft";render();
  });
  document.addEventListener("click",e=>{
    const el=e.target.closest("[data-do]");
    if(!el){
      if(popup && !e.target.closest(".popover")){popup=null;render();}
      return;
    }
    const doIt=el.dataset.do;
    if(doIt==="backdrop" && e.target!==el)return;
    if(doIt==="backdrop"||doIt==="close-modal"){overlay=null;render();return;}
    if(doIt==="toggle-devices-group"){devicesExpanded=!devicesExpanded;render();return;}
    if(doIt==="remote-refresh"){remoteWork();return;}
    if(doIt==="remote-logout"){remoteLogout();return;}
    if(doIt==="remote-enroll"){
      if(remoteCredential&&!window.confirm("Discard the credential currently shown?"))return;
      remoteWork(async()=>{
        const result=await onlineRequest("","POST");
        remoteCredential={id:result.device_id,kind:"device",token:result.device_token};
      });return;
    }
    if(doIt==="remote-copy"){
      if(!navigator.clipboard){toast("Clipboard unavailable. Allow clipboard access and try again.");return;}
      if(remoteCredential)navigator.clipboard.writeText(remoteCredential.token)
        .then(()=>toast("Credential copied. Clear your clipboard after use."))
        .catch(()=>toast("Clipboard unavailable. Allow clipboard access and try again."));
      return;
    }
    if(doIt==="remote-dismiss"){remoteCredential=null;render();return;}
    if(doIt==="remote-revoke-host"||doIt==="remote-revoke-device"){
      const id=el.dataset.id;
      const host=doIt==="remote-revoke-host";
      if(!window.confirm(host?"Revoke this host credential?":"Remove this device and revoke its host access?"))return;
      remoteWork(async()=>{
        await onlineRequest("/"+encodeURIComponent(id)+(host?"/host":""),"DELETE");
        if(remoteCredential?.id===id&&(!host||remoteCredential.kind==="host"))remoteCredential=null;
      });return;
    }
    if(doIt==="setup-next"){setupStep=Math.min(setupStep+1,3);render();return;}
    if(doIt==="setup-back"){setupStep=Math.max(setupStep-1,1);render();return;}
    if(doIt==="setup-copy"){
      const command=localLaunchCommand();
      if(!command)return;
      if(navigator.clipboard?.writeText){navigator.clipboard.writeText(command).then(()=>toast("Command copied.")).catch(()=>toast("Clipboard unavailable. Select and copy the command."));}
      else{const code=document.getElementById("setup-command");const selection=getSelection();const range=document.createRange();if(code&&selection){range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);}toast("Select and copy the command.");}
      return;
    }
    if(doIt==="connect-local"){overlay="connect-local";render();return;}
    if(doIt==="disconnect-local"){disconnectLocal();return;}
    if(doIt==="choose-local-folder"){grantNativeFolder();return;}
    if(doIt==="index-local-grant"){const id=grantAtIndex(Number(el.dataset.index));rowMenu=-1;localIndex(id);return;}
    if(doIt==="revoke-grant"){pendingGrant=el.dataset.grantId;rowMenu=-1;overlay="revoke-grant";render();return;}
    if(doIt==="confirm-revoke-grant"&&pendingGrant){const id=pendingGrant;pendingGrant=null;overlay=null;
      localWork(()=>nativeRequest("/v1/folders/revoke",{grant_id:id}),()=> "Folder permission revoked and local index removed.");return;}
    if(doIt==="mcp-toggle"){toggleMcp();return;}
    if(doIt==="mcp-copy"){const value=document.getElementById("mcp-config")?.textContent||"";
      navigator.clipboard?.writeText(value).then(()=>toast("Antigravity config copied.")).catch(()=>toast("Select and copy the config manually."));return;}
    if(doIt==="drawer"){drawer=!drawer;render();return;}
    if(doIt==="close-drawer"){drawer=false;render();return;}
    if(doIt.endsWith("-pop")){const v=doIt.slice(0,-4);popup=popup===v?null:v;render();return;}
    if(doIt==="row-menu"){rowMenu=rowMenu===Number(el.dataset.index)?-1:Number(el.dataset.index);render();return;}
    if(doIt==="save-draft"){
      if(!document.getElementById("draft-ok")?.checked){toast("Please confirm this is a browser-only draft.");return;}
      const ds=drafts();
      if(ds.length>=16){toast("Maximum 16 drafts.");return;}
      if(!saveDrafts([...ds,pendingPath])){toast("Session storage unavailable. Not saved.");return;}
      const cameFromDeviceFilter=new URLSearchParams(location.hash.split("?")[1]||"").has("device");
      overlay=null;pendingPath="";
      if(cameFromDeviceFilter)location.hash="#/folders";
      render();
      toast(cameFromDeviceFilter?"Draft saved under All Folders. It has no assigned device or file permissions.":"Draft saved in this browser session. No file permissions were granted.");return;
    }
    if(doIt==="remove-draft"){rowMenu=-1;overlay=`remove:${el.dataset.index}`;render();return;}
    if(doIt==="confirm-remove"){
      const i=Number(el.dataset.index),ds=drafts();if(i>=0&&i<ds.length)ds.splice(i,1);
      saveDrafts(ds);overlay=null;render();toast("Browser draft removed.");return;
    }
    if(doIt==="reindex"){if(localSession){refreshLocalData().catch(()=>toast("Cannot refresh Agent."));return;}
      toast("No indexing started. A verified RAGO Agent is required.");return;}
    if(doIt==="view-folder"){overlay="sample";render();return;}
    if(doIt==="how"||doIt==="citations"||doIt==="progress-detail"||doIt==="device-pairing-info"){overlay=doIt;render();return;}
    if(doIt==="docs"){location.hash="#/help";return;}
    if(["folders","activity","connections"].includes(doIt)){location.hash=href(doIt);return;}
  });
  window.addEventListener("hashchange",()=>{overlay=null;popup=null;rowMenu=-1;drawer=false;if(navDevices.some(([name])=>name===route()))devicesExpanded=true;if(route()==="add-device")setupStep=1;if(route()==="online")remoteWork();else remoteCredential=null;render();window.scrollTo(0,0);});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&(overlay||popup||drawer||rowMenu>=0)){overlay=null;popup=null;drawer=false;rowMenu=-1;render();}});
  render();
  if(route()==="online")remoteWork();
})();
