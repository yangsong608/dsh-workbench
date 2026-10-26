/* eslint-disable */
/** UI 设计 / DEMO 两个视图共用的样式（Shadow DOM 内生效）。 */
export const UI_DEMO_CSS = String.raw`
/* ---------- 通用 ---------- */
.ud-view{display:flex;flex-direction:column;gap:12px;padding:14px 16px 28px}
.ud-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.ud-head h2{margin:0;font-size:17px;letter-spacing:-.3px}
.ud-head .sub{margin:2px 0 0;font-size:11px;color:var(--text-3)}
.ud-eyebrow{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:700}
.ud-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.ud-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line)}
.ud-tab{height:34px;padding:0 11px;border:0;background:transparent;color:var(--text-3);font-size:11.5px;border-bottom:2px solid transparent;cursor:pointer}
.ud-tab:hover{color:var(--text-2)}
.ud-tab.active{color:var(--accent-ink);border-bottom-color:var(--accent);font-weight:600}
.ud-panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.ud-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.ud-panel-head b{font-size:12.5px}
.ud-panel-head span{font-size:10px;color:var(--text-3);display:block;margin-top:1px}
.ud-panel-body{padding:12px}
.ud-empty{border:1px dashed var(--line);border-radius:10px;padding:22px;text-align:center;color:var(--text-3);font-size:11.5px}
.ud-badge{font-size:9.5px;border-radius:99px;padding:1px 8px;border:1px solid var(--line);color:var(--text-3);background:var(--panel-2)}
.ud-badge.ready{color:var(--green);border-color:color-mix(in srgb,var(--green) 40%,var(--line));background:var(--green-soft)}
.ud-badge.multi{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}
.ud-badge.single{color:var(--green);border-color:color-mix(in srgb,var(--green) 35%,var(--line))}
.ud-sel{height:27px;padding:0 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text-2);font:10.5px var(--font)}
.ud-btn{display:inline-flex;align-items:center;gap:4px;height:27px;padding:0 10px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--text-2);font-size:10.5px;font-weight:500;cursor:pointer}
.ud-btn:hover{background:var(--hover);color:var(--text);border-color:var(--line-strong)}
.ud-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.ud-btn.primary:hover{background:var(--accent-ink)}
.ud-btn.tiny{height:22px;padding:0 7px;font-size:9.5px}

/* ---------- UI 设计：页面清单 ---------- */
.ud-pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ud-page{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.ud-page:hover{border-color:color-mix(in srgb,var(--accent) 30%,var(--line));background:var(--panel)}
.ud-page .top{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.ud-page b{font-size:12px}
.ud-route{font-size:9px;font-family:ui-monospace,Menlo,monospace;color:var(--text-3);background:var(--panel-3);border-radius:4px;padding:0 5px}
.ud-page .goal{font-size:10px;color:var(--text-2);margin:3px 0 6px}
.ud-blocks{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}
.ud-blk{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--text-3)}
.ud-role{font-size:8px;color:var(--accent-ink);background:var(--accent-soft);border-radius:3px;padding:0 4px;font-family:ui-monospace,monospace}
.ud-tags{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.ud-tag{font-size:8.5px;border-radius:4px;padding:0 5px;border:1px solid var(--line);color:var(--text-3)}
.ud-tag.st{color:var(--amber);border-color:color-mix(in srgb,var(--amber) 35%,var(--line))}
.ud-page .ops{display:flex;gap:4px}

/* ---------- UI 设计：规范 + 令牌 ---------- */
.ud-spec-wrap{display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:10px}
.ud-spec{font-size:11.5px;color:var(--text-2);line-height:1.75;max-height:520px;overflow:auto}
.ud-spec h3{font-size:12px;margin:13px 0 4px;padding-bottom:3px;border-bottom:1px solid var(--line);color:var(--text)}
.ud-spec h3:first-child{margin-top:0}
.ud-spec ul{padding-left:16px;margin:3px 0}
.ud-token-panel{background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:10px;align-self:start;position:sticky;top:8px}
.ud-swatches{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0 10px}
.ud-sw{width:34px;height:24px;border-radius:5px;border:1px solid var(--line);position:relative}
.ud-sw span{position:absolute;bottom:-13px;left:0;font-size:7.5px;color:var(--text-3)}
.ud-trow{display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:10px;color:var(--text-2)}
.ud-trow label{width:44px;color:var(--text-3);font-size:9.5px;flex-shrink:0}
.ud-trow input[type=range]{flex:1;accent-color:var(--accent)}
.ud-mini{border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--panel);margin-top:9px}
.ud-mini-card{background:var(--panel-2);border:1px solid var(--line);border-radius:7px;padding:7px 9px}

/* ---------- 线框预览 ---------- */
.ud-wires{display:flex;flex-direction:column;gap:9px}
.ud-wire{background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:10px}
.ud-wire-head{display:flex;align-items:center;gap:7px;margin-bottom:8px;font-size:11px}
.ud-wire-frame{border:1.5px dashed var(--line-strong);border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;background:var(--panel)}
.ud-wire-blk{border:1px solid var(--line);border-radius:5px;background:var(--panel-3);padding:6px 8px;font-size:9.5px;color:var(--text-3);display:flex;align-items:center;gap:5px}

/* ---------- 版本列表 ---------- */
.ud-vlist{display:flex;flex-direction:column;gap:3px}
.ud-vrow{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid transparent;border-radius:7px;font-size:10.5px}
.ud-vrow:hover{background:var(--hover)}
.ud-vrow.current{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.ud-vseq{font-weight:700;width:26px}
.ud-vlabel{flex:1;color:var(--text-2)}
.ud-vmeta{font-size:9px;color:var(--text-3)}
.ud-vops{display:flex;gap:1px;opacity:0}
.ud-vrow:hover .ud-vops{opacity:1}

/* ---------- DEMO：列表 + 预览 ---------- */
.ud-demo-wrap{display:grid;grid-template-columns:210px minmax(0,1fr);gap:10px;align-items:start}
.ud-demo-list{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.ud-dlist{display:flex;flex-direction:column;padding:5px}
.ud-ditem{border:1px solid transparent;border-radius:7px;padding:6px 8px;cursor:pointer}
.ud-ditem:hover{background:var(--hover)}
.ud-ditem.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.ud-ditem b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-ditem span{display:block;font-size:8.5px;color:var(--text-3);margin-top:1px}
.ud-frame-bar{display:flex;align-items:center;gap:5px;padding:6px 9px;border-bottom:1px solid var(--line);background:var(--panel-2);flex-wrap:wrap}
.ud-vp{font-size:9px;padding:2px 8px;border-radius:5px;border:1px solid var(--line);background:transparent;color:var(--text-3);cursor:pointer}
.ud-vp.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,var(--line));color:var(--text);font-weight:600}
.ud-frame-wrap{background:#fff;height:460px;overflow:auto}
.ud-frame-wrap.mobile{max-width:390px;margin:0 auto;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.ud-frame-wrap.tablet{max-width:834px;margin:0 auto;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.ud-iframe{width:100%;height:100%;border:0;display:block;background:#fff}

/* ---------- 文件树 ---------- */
.ud-tree{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;line-height:1.85;color:var(--text-2)}
.ud-tree .d{color:var(--text);font-weight:600}
.ud-tree .sz{color:var(--text-3);font-size:9px;margin-left:5px}
.ud-tree .role{font-size:8px;border-radius:3px;padding:0 4px;margin-left:5px;border:1px solid var(--line);color:var(--text-3)}
.ud-tree .role.entry{color:var(--green);border-color:color-mix(in srgb,var(--green) 35%,var(--line))}
.ud-tree .role.page{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}

/* ---------- 进度 ---------- */
.ud-progress{border:1px solid var(--line);border-radius:9px;padding:8px 10px;margin-bottom:9px;background:var(--panel)}
.ud-progress.done{border-color:color-mix(in srgb,var(--green) 35%,var(--line))}
.ud-progress.failed{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.ud-progress-head{display:flex;align-items:center;gap:7px;font-size:10.5px}
.ud-progress-head b{color:var(--text)}
.ud-progress-head span{color:var(--text-3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ud-progress-bar{height:5px;border-radius:99px;background:var(--panel-3);margin:6px 0 3px;overflow:hidden}
.ud-progress-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),#8b87ff);transition:width .3s}
.ud-chat{min-height:0}

@media (max-width:1080px){
  .ud-pages,.ud-spec-wrap,.ud-demo-wrap{grid-template-columns:1fr}
}
`
