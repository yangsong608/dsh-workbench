/* eslint-disable */
/** UI 设计 / DEMO 两个视图共用的样式（Shadow DOM 内生效）。 */
export const UI_DEMO_CSS = String.raw`
/* ---------- 通用 ---------- */
/* 局部变量兜底：.ud-root 自带一套，避免在某些宿主环境下 --accent 等未继承导致按钮白底白字 */
.ud-root{
  --ud-accent:#5b5bd6;              /* 固定品牌紫：不继承主题 --accent，避免主题 accent 为浅色时按钮白底白字 */
  --ud-accent-ink:#4a4ac2;
  --ud-accent-soft:#eeeefc;
  --ud-panel:var(--panel,#ffffff);
  --ud-panel-2:var(--panel-2,#fafafb);
  --ud-panel-3:var(--panel-3,#f6f6f8);
  --ud-line:var(--line,#e7e7eb);
  --ud-line-strong:var(--line-strong,#d8d8df);
  --ud-text:var(--text,#1a1a1f);
  --ud-text-2:var(--text-2,#656570);
  --ud-text-3:var(--text-3,#9797a2);
  --ud-hover:var(--hover,#f2f2f5);
  --ud-green:var(--green,#0f9f6e);
  --ud-green-soft:var(--green-soft,#e7f6f0);
  --ud-amber:var(--amber,#c27c0e);
  --ud-amber-soft:var(--amber-soft,#fdf3e3);
  --ud-red:var(--red,#d83b3b);
  --ud-radius:var(--radius,12px);
  --ud-shadow:var(--shadow,0 1px 2px rgba(16,16,28,.05),0 10px 30px rgba(16,16,28,.06));
  color:var(--ud-text);
}
.ud-view{display:flex;flex-direction:column;gap:12px;padding:14px 16px 28px}
.ud-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.ud-head h2{margin:0;font-size:17px;letter-spacing:-.3px}
.ud-head .sub{margin:2px 0 0;font-size:11px;color:var(--ud-text-3)}
.ud-eyebrow{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ud-accent);font-weight:700}
.ud-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.ud-tabs{display:flex;gap:2px;border-bottom:1px solid var(--ud-line)}
.ud-tab{height:34px;padding:0 11px;border:0;background:transparent;color:var(--ud-text-3);font-size:11.5px;border-bottom:2px solid transparent;cursor:pointer}
.ud-tab:hover{color:var(--ud-text-2)}
.ud-tab.active{color:var(--ud-accent-ink);border-bottom-color:var(--ud-accent);font-weight:600}
.ud-panel{background:var(--ud-panel);border:1px solid var(--ud-line);border-radius:var(--ud-radius);box-shadow:var(--ud-shadow);overflow:hidden}
.ud-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--ud-line);flex-wrap:wrap}
.ud-panel-head b{font-size:12.5px}
.ud-panel-head span{font-size:10px;color:var(--ud-text-3);display:block;margin-top:1px}
.ud-panel-body{padding:12px}
.ud-empty{border:1px dashed var(--ud-line);border-radius:10px;padding:22px;text-align:center;color:var(--ud-text-3);font-size:11.5px}
.ud-badge{font-size:9.5px;border-radius:99px;padding:1px 8px;border:1px solid var(--ud-line);color:var(--ud-text-3);background:var(--ud-panel-2)}
.ud-badge.ready{color:var(--ud-green);border-color:color-mix(in srgb,var(--ud-green) 40%,var(--ud-line));background:var(--ud-green-soft)}
.ud-badge.multi{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 35%,var(--ud-line))}
.ud-badge.single{color:var(--ud-green);border-color:color-mix(in srgb,var(--ud-green) 35%,var(--ud-line))}
.ud-sel{height:27px;padding:0 8px;border:1px solid var(--ud-line);border-radius:7px;background:var(--ud-panel);color:var(--ud-text-2);font:10.5px var(--font)}
.ud-btn{display:inline-flex;align-items:center;gap:4px;height:27px;padding:0 10px;border-radius:7px;border:1px solid var(--ud-line);background:var(--ud-panel);color:var(--ud-text-2);font-size:10.5px;font-weight:500;cursor:pointer}
.ud-btn:hover{background:var(--ud-hover);color:var(--ud-text);border-color:var(--ud-line-strong)}
.ud-btn.primary{background:var(--ud-accent);border-color:var(--ud-accent);color:#fff!important}
.ud-btn.primary:hover{background:var(--ud-accent-ink)}
.ud-btn.tiny{height:22px;padding:0 7px;font-size:9.5px}

/* ---------- UI 设计：页面清单 ---------- */
.ud-pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ud-page{background:var(--ud-panel-2);border:1px solid var(--ud-line);border-radius:10px;padding:10px 12px}
.ud-page:hover{border-color:color-mix(in srgb,var(--ud-accent) 30%,var(--ud-line));background:var(--ud-panel)}
.ud-page .top{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.ud-page b{font-size:12px}
.ud-route{font-size:9px;font-family:ui-monospace,Menlo,monospace;color:var(--ud-text-3);background:var(--ud-panel-3);border-radius:4px;padding:0 5px}
.ud-page .goal{font-size:10px;color:var(--ud-text-2);margin:3px 0 6px}
.ud-blocks{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}
.ud-blk{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--ud-text-3)}
.ud-role{font-size:8px;color:var(--ud-accent-ink);background:var(--ud-accent-soft);border-radius:3px;padding:0 4px;font-family:ui-monospace,monospace}
.ud-tags{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.ud-tag{font-size:8.5px;border-radius:4px;padding:0 5px;border:1px solid var(--ud-line);color:var(--ud-text-3)}
.ud-tag.st{color:var(--ud-amber);border-color:color-mix(in srgb,var(--ud-amber) 35%,var(--ud-line))}
.ud-page .ops{display:flex;gap:4px}

/* 页面覆盖度徽标 */
.ud-cov{display:inline-block;font-size:9px;border-radius:5px;padding:1px 6px;margin-bottom:5px;
  border:1px solid color-mix(in srgb,var(--ud-green) 35%,var(--ud-line));color:var(--ud-text-2);cursor:pointer}
.ud-cov:hover{background:var(--ud-hover)}
.ud-cov.bad{border-color:color-mix(in srgb,var(--ud-red) 40%,var(--ud-line))}
.ud-cov-none{border-color:var(--ud-line);color:var(--ud-text-3)}

/* ---------- UI 设计：规范 + 令牌 ---------- */
.ud-spec-wrap{display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:10px}
.ud-spec{font-size:11.5px;color:var(--ud-text-2);line-height:1.75;max-height:520px;overflow:auto}
.ud-spec h3{font-size:12px;margin:13px 0 4px;padding-bottom:3px;border-bottom:1px solid var(--ud-line);color:var(--ud-text)}
.ud-spec h3:first-child{margin-top:0}
.ud-spec ul{padding-left:16px;margin:3px 0}
.ud-token-panel{background:var(--ud-panel-2);border:1px solid var(--ud-line);border-radius:9px;padding:10px;align-self:start;position:sticky;top:8px}
.ud-swatches{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0 10px}
.ud-sw{width:34px;height:24px;border-radius:5px;border:1px solid var(--ud-line);position:relative}
.ud-sw span{position:absolute;bottom:-13px;left:0;font-size:7.5px;color:var(--ud-text-3)}
.ud-trow{display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:10px;color:var(--ud-text-2)}
.ud-trow label{width:44px;color:var(--ud-text-3);font-size:9.5px;flex-shrink:0}
.ud-trow input[type=range]{flex:1;accent-color:var(--ud-accent)}
.ud-mini{border:1px solid var(--ud-line);border-radius:8px;padding:8px;background:var(--ud-panel);margin-top:9px}
.ud-mini-card{background:var(--ud-panel-2);border:1px solid var(--ud-line);border-radius:7px;padding:7px 9px}

/* ---------- 线框预览 ---------- */
.ud-wires{display:flex;flex-direction:column;gap:9px}
.ud-wire{background:var(--ud-panel-2);border:1px solid var(--ud-line);border-radius:9px;padding:10px}
.ud-wire-head{display:flex;align-items:center;gap:7px;margin-bottom:8px;font-size:11px}
.ud-wire-frame{border:1.5px dashed var(--ud-line-strong);border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;background:var(--ud-panel)}
.ud-wire-blk{border:1px solid var(--ud-line);border-radius:5px;background:var(--ud-panel-3);padding:6px 8px;font-size:9.5px;color:var(--ud-text-3);display:flex;align-items:center;gap:5px}

/* ---------- 版本列表 ---------- */
.ud-vlist{display:flex;flex-direction:column;gap:3px}
.ud-vrow{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid transparent;border-radius:7px;font-size:10.5px}
.ud-vrow:hover{background:var(--ud-hover)}
.ud-vrow.current{background:var(--ud-accent-soft);border-color:color-mix(in srgb,var(--ud-accent) 30%,var(--ud-line))}
.ud-vseq{font-weight:700;width:26px}
.ud-vlabel{flex:1;color:var(--ud-text-2)}
.ud-vmeta{font-size:9px;color:var(--ud-text-3)}
.ud-vops{display:flex;gap:1px;opacity:0}
.ud-vrow:hover .ud-vops{opacity:1}

/* ---------- DEMO：列表 + 预览 ---------- */
.ud-demo-wrap{display:grid;grid-template-columns:210px minmax(0,1fr);gap:10px;align-items:start}
.ud-demo-list{background:var(--ud-panel);border:1px solid var(--ud-line);border-radius:var(--ud-radius);box-shadow:var(--ud-shadow);overflow:hidden}
.ud-dlist{display:flex;flex-direction:column;padding:5px}
.ud-ditem{border:1px solid transparent;border-radius:7px;padding:6px 8px;cursor:pointer}
.ud-ditem:hover{background:var(--ud-hover)}
.ud-ditem.active{background:var(--ud-accent-soft);border-color:color-mix(in srgb,var(--ud-accent) 30%,var(--ud-line))}
.ud-ditem b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ud-text)}
.ud-ditem span{display:block;font-size:8.5px;color:var(--ud-text-3);margin-top:1px}
.ud-frame-bar{display:flex;align-items:center;gap:5px;padding:6px 9px;border-bottom:1px solid var(--ud-line);background:var(--ud-panel-2);flex-wrap:wrap}
.ud-vp{font-size:9px;padding:2px 8px;border-radius:5px;border:1px solid var(--ud-line);background:transparent;color:var(--ud-text-3);cursor:pointer}
.ud-vp.on{background:var(--ud-accent-soft);border-color:color-mix(in srgb,var(--ud-accent) 35%,var(--ud-line));color:var(--ud-text);font-weight:600}
.ud-frame-wrap{background:#fff;height:460px;overflow:auto}
.ud-frame-wrap.mobile{max-width:390px;margin:0 auto;border-left:1px solid var(--ud-line);border-right:1px solid var(--ud-line)}
.ud-frame-wrap.tablet{max-width:834px;margin:0 auto;border-left:1px solid var(--ud-line);border-right:1px solid var(--ud-line)}
.ud-iframe{width:100%;height:100%;border:0;display:block;background:#fff}

/* ---------- 文件树 ---------- */
.ud-tree{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;line-height:1.85;color:var(--ud-text-2)}
.ud-tree .d{color:var(--ud-text);font-weight:600}
.ud-tree .sz{color:var(--ud-text-3);font-size:9px;margin-left:5px}
.ud-tree .role{font-size:8px;border-radius:3px;padding:0 4px;margin-left:5px;border:1px solid var(--ud-line);color:var(--ud-text-3)}
.ud-tree .role.entry{color:var(--ud-green);border-color:color-mix(in srgb,var(--ud-green) 35%,var(--ud-line))}
.ud-tree .role.page{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 35%,var(--ud-line))}

/* ---------- 进度 ---------- */
.ud-progress{border:1px solid var(--ud-line);border-radius:9px;padding:8px 10px;margin-bottom:9px;background:var(--ud-panel)}
.ud-progress.done{border-color:color-mix(in srgb,var(--ud-green) 35%,var(--ud-line))}
.ud-progress.failed{border-color:color-mix(in srgb,var(--ud-red) 35%,var(--ud-line))}
.ud-progress-head{display:flex;align-items:center;gap:7px;font-size:10.5px}
.ud-progress-head b{color:var(--ud-text)}
.ud-progress-head span{color:var(--ud-text-3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ud-progress-bar{height:5px;border-radius:99px;background:var(--ud-panel-3);margin:6px 0 3px;overflow:hidden}
.ud-progress-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--ud-accent),#8b87ff);transition:width .3s}
.ud-chat{min-height:0}

@media (max-width:1080px){
  .ud-pages,.ud-spec-wrap,.ud-demo-wrap{grid-template-columns:1fr}
}
`
