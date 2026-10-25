window.__ModuleLoader__.load({
	id: "dsh-workbench",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// src/client/styles.ts
		/** 工作台样式（Shadow DOM 内生效；由 dsh-portal 原型 CSS 迁移）。 */
		const WORKBENCH_CSS = String.raw`
:host{
  display:block;height:100%;
  --font:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  /* 默认跟随 DSH 主题服务注入的 --dsw-alias-* token：MOSS / opencode-palette 换肤会自动生效 */
  --bg:var(--dsw-alias-bg-base,#f4f4f6);
  --panel:var(--dsw-alias-bg-layer-1,#ffffff);
  --panel-2:var(--dsw-alias-bg-layer-2,#fafafb);
  --panel-3:var(--dsw-alias-bg-layer-3,#f6f6f8);
  --line:var(--dsw-alias-border-l1,#e7e7eb);
  --line-strong:var(--dsw-alias-border-l2,#d8d8df);
  --hover:color-mix(in srgb,var(--dsw-alias-label-primary,#1a1a1f) 5%,var(--panel));
  --text:var(--dsw-alias-label-primary,#1a1a1f);
  --text-2:var(--dsw-alias-label-secondary,#656570);
  --text-3:var(--dsw-alias-label-tertiary,#9797a2);
  --accent:var(--dsw-alias-brand-primary,#5b5bd6);
  --accent-ink:var(--dsw-alias-brand-text,#4a4ac2);
  --accent-soft:color-mix(in srgb,var(--accent) 14%,var(--panel));
  --green:var(--dsw-alias-state-success-primary,#0f9f6e);
  --green-soft:color-mix(in srgb,var(--green) 13%,var(--panel));
  --amber:var(--dsw-alias-state-warn-primary,#c27c0e);
  --orange:var(--dsw-alias-state-warn-primary,#d97706);
  --amber-soft:color-mix(in srgb,var(--amber) 15%,var(--panel));
  --red:var(--dsw-alias-state-error-primary,#d83b3b);
  --red-soft:color-mix(in srgb,var(--red) 13%,var(--panel));
  --blue:var(--dsw-alias-link,#2563eb);
  --shadow:0 1px 2px rgba(16,16,28,.05),0 10px 30px rgba(16,16,28,.06);
  --radius:12px;
  color-scheme:light;
}
/* 工作台内显式浅色：不跟随宿主 token */
:host([data-wb-theme="light"]){
  --bg:#f4f4f6; --panel:#ffffff; --panel-2:#fafafb; --panel-3:#f6f6f8;
  --line:#e7e7eb; --line-strong:#d8d8df; --hover:#f2f2f5;
  --text:#1a1a1f; --text-2:#656570; --text-3:#9797a2;
  --accent:#5b5bd6; --accent-ink:#4a4ac2; --accent-soft:#eeeefc;
  --green:#0f9f6e; --green-soft:#e7f6f0;
  --amber:#c27c0e; --amber-soft:#fdf3e3;
  --red:#d83b3b; --red-soft:#fdecec;
  --blue:#2563eb;
  --shadow:0 1px 2px rgba(16,16,28,.05),0 10px 30px rgba(16,16,28,.06);
  color-scheme:light;
}
/* 工作台内显式深色 */
:host([data-wb-theme="dark"]){
  --bg:#111113; --panel:#19191d; --panel-2:#1e1e23; --panel-3:#222228;
  --line:#2a2a31; --line-strong:#3a3a44; --hover:#232329;
  --text:#ecedf1; --text-2:#a3a3b0; --text-3:#777784;
  --accent:#8b87ff; --accent-ink:#b3b0ff; --accent-soft:#26243f;
  --green:#38c793; --green-soft:#123026;
  --amber:#e3a33d; --amber-soft:#33260f;
  --red:#f07171; --red-soft:#3a1a1a;
  --blue:#6b9bff;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 34px rgba(0,0,0,.35);
  color-scheme:dark;
}
:host([data-wb-scheme="dark"]){color-scheme:dark}
*{box-sizing:border-box}
:host{background:var(--bg);color:var(--text);font:13px/1.55 var(--font);-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit}
::selection{background:var(--accent-soft);color:var(--accent-ink)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--line-strong);border:3px solid transparent;background-clip:content-box;border-radius:999px}
::-webkit-scrollbar-track{background:transparent}

.app{display:flex;height:100%;min-height:640px;min-width:960px}
/* ---------- sidebar ---------- */
.sidebar{width:var(--wb-side-w,200px);flex:0 0 var(--wb-side-w,200px);background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:12px 10px 10px}
.brand{display:flex;align-items:center;gap:9px;padding:2px 7px 13px}
.brand-mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(150deg,var(--accent-soft),color-mix(in srgb,var(--accent) 26%,var(--panel)));display:grid;place-items:center;color:var(--accent-ink);flex:0 0 auto}
.brand-t{font-size:13.5px;font-weight:650;letter-spacing:-.1px;line-height:1.25}
.brand-s{font-size:10.5px;color:var(--text-3);line-height:1.3}
.brand-collapse{margin-left:auto;color:var(--text-3);background:none;border:0;cursor:pointer;padding:3px;border-radius:6px}
.brand-collapse:hover{background:var(--hover);color:var(--text-2)}
.side-scroll{flex:1;overflow:auto;padding:0 1px 8px}
.side-sec{margin-bottom:14px}
.side-head{display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:11px;color:var(--text-3);font-weight:600;letter-spacing:.02em}
.side-head .count{font-weight:500;color:var(--text-3);opacity:.9}
.side-head .add{margin-left:auto;border:0;background:none;color:var(--text-3);cursor:pointer;padding:2px;border-radius:5px;display:grid;place-items:center}
.side-head .add:hover{background:var(--hover);color:var(--text)}
.side-item{display:flex;align-items:center;gap:8px;height:31px;padding:0 8px;border-radius:7px;color:var(--text-2);cursor:pointer;font-size:12.5px;user-select:none}
.side-item:hover{background:var(--hover);color:var(--text)}
.side-item.active{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
.side-item svg{opacity:.85;flex:0 0 auto}
.side-item .n{margin-left:auto;font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums}
.side-item .dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.side-sub{padding:2px 8px 0 10px;font-size:10.5px;color:var(--text-3);line-height:1.5}
.side-foot{border-top:1px solid var(--line);padding:10px 8px 2px;display:flex;align-items:center;gap:8px;color:var(--text-3);font-size:11px}
.foot-ring{width:20px;height:20px;border-radius:50%;background:conic-gradient(var(--green) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center;flex:0 0 auto}
.foot-ring i{width:14px;height:14px;border-radius:50%;background:var(--panel);display:block}
.side-foot b{color:var(--text-2);font-weight:600}
/* ---------- main ---------- */
.main{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}
.topbar{height:50px;flex:0 0 50px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 14px}
.crumb{font-size:12px;color:var(--text-3);white-space:nowrap;display:flex;align-items:center;gap:7px}
.crumb b{color:var(--text);font-weight:600}
.searchbar{flex:1;max-width:500px;margin:0 8px;height:30px;border:1px solid var(--line);background:var(--panel-2);border-radius:7px;display:flex;align-items:center;gap:7px;padding:0 9px;color:var(--text-3);transition:border-color .15s,box-shadow .15s}
.searchbar:focus-within{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 0 0 3px var(--accent-soft);background:var(--panel)}
.searchbar input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font:inherit;min-width:0}
.searchbar input::placeholder{color:var(--text-3)}
.kbd{border:1px solid var(--line);border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;color:var(--text-3);background:var(--panel);white-space:nowrap}
.top-actions{margin-left:auto;display:flex;align-items:center;gap:4px}
.icon-btn{width:29px;height:29px;border-radius:7px;border:0;background:transparent;color:var(--text-2);display:grid;place-items:center;cursor:pointer}
.icon-btn:hover{background:var(--hover);color:var(--text)}
.icon-btn.on{background:var(--accent-soft);color:var(--accent-ink)}
.save{font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:5px;margin:0 4px;white-space:nowrap}
.save i{width:6px;height:6px;border-radius:50%;background:var(--green);display:block}
.btn-primary{height:29px;padding:0 13px;border:0;border-radius:7px;background:var(--accent);color:#fff;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(91,91,214,.3)}
.btn-primary:hover{filter:brightness(1.06)}
.workspace{flex:1;min-height:0;display:flex}
.content{flex:1;min-width:0;overflow:auto;padding:20px 24px 48px}
.detail{width:318px;flex:0 0 318px;border-left:1px solid var(--line);background:var(--panel);overflow:auto;display:flex;flex-direction:column}
.detail.hide{display:none}
/* ---------- shared ---------- */
.view-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
.eyebrow{font-size:11.5px;color:var(--text-3);margin-bottom:3px;letter-spacing:.01em}
h1.page-title{font-size:29px;line-height:1.18;margin:0;font-weight:700;letter-spacing:-.7px}
.page-sub{font-size:12px;color:var(--text-2);margin-top:6px}
.progress-card{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px 8px 10px;box-shadow:var(--shadow)}
.p-ring{width:38px;height:38px;border-radius:50%;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center;flex:0 0 auto}
.p-ring i{width:30px;height:30px;background:var(--panel);border-radius:50%;display:grid;place-items:center;font-size:9.5px;font-style:normal;color:var(--text-2);font-variant-numeric:tabular-nums}
.p-num{font-size:15px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums}
.p-lab{font-size:11px;color:var(--text-3)}
.viewbar{display:flex;align-items:center;gap:8px;margin-bottom:13px;flex-wrap:wrap}
.seg{display:flex;gap:2px;padding:2px;border:1px solid var(--line);background:var(--panel);border-radius:8px}
.seg button{height:26px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--text-2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap}
.seg button:hover{background:var(--hover);color:var(--text)}
.seg button.active{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
.filters{margin-left:auto;display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.chip{height:26px;padding:0 9px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--text-2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap}
.chip:hover{background:var(--hover);color:var(--text)}
.chip.active{background:var(--panel);border-color:var(--line);color:var(--text);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.chip.ghost{border-color:var(--line);background:var(--panel);height:27px}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto}
.pill{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;white-space:nowrap}
.pill.green{background:var(--green-soft);color:var(--green)}
.pill.amber{background:var(--amber-soft);color:var(--amber)}
.pill.gray{background:var(--panel-3);color:var(--text-2)}
.pill.red{background:var(--red-soft);color:var(--red)}
.muted{color:var(--text-3)}
.mono{font-variant-numeric:tabular-nums}
/* quick add + search row */
.quickbar{background:var(--panel);border:1px solid var(--line);border-radius:9px;height:36px;display:flex;align-items:center;gap:8px;padding:0 11px;color:var(--text-3);margin-bottom:8px}
.quickbar input{flex:1;border:0;outline:0;background:transparent;font:inherit;color:var(--text)}
.quickbar input::placeholder{color:var(--text-3)}
.quickbar .hint{display:flex;gap:6px;align-items:center}
.listbar{background:var(--panel);border:1px solid var(--line);border-radius:9px;height:34px;display:flex;align-items:center;gap:8px;padding:0 11px;color:var(--text-3);margin-bottom:12px;font-size:12px}
.listbar input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font:inherit}
/* ---------- board ---------- */
.kanban{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.col{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:9px;min-height:280px}
.col-head{display:flex;align-items:center;gap:7px;padding:2px 3px 9px;font-size:12px;font-weight:650}
.col-head .n{color:var(--text-3);font-weight:500;font-size:11.5px}
.col-head .add{margin-left:auto;width:22px;height:22px;border-radius:6px;border:0;background:transparent;color:var(--text-3);display:grid;place-items:center;cursor:pointer}
.col-head .add:hover{background:var(--hover);color:var(--text)}
.col-search{height:28px;border:1px solid var(--line);background:var(--panel);border-radius:7px;display:flex;align-items:center;gap:6px;padding:0 8px;color:var(--text-3);font-size:11.5px;margin-bottom:8px}
.task-card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 10px;margin-bottom:8px;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s}
.task-card:hover{border-color:var(--line-strong);box-shadow:0 2px 8px rgba(16,16,28,.05)}
.task-card.selected{border-color:color-mix(in srgb,var(--accent) 70%,var(--line));box-shadow:0 0 0 3px var(--accent-soft)}
.card-top{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2)}
.card-top .sp{display:flex;align-items:center;gap:5px}
.card-top .flags{margin-left:auto;display:flex;align-items:center;gap:5px;color:var(--text-3)}
.task-card h3{margin:6px 0 4px;font-size:12.5px;font-weight:600;line-height:1.4;letter-spacing:0}
.task-card p{margin:0;font-size:11.5px;line-height:1.5;color:var(--text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-foot{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:10.5px;color:var(--text-3)}
.card-foot .sync{margin-left:auto;color:var(--accent-ink);display:flex;align-items:center;gap:3px;font-size:10.5px}
.col-empty{color:var(--text-3);font-size:11.5px;text-align:center;padding:18px 0;border:1px dashed var(--line);border-radius:8px;margin-bottom:8px}
/* ---------- list ---------- */
.group{margin-bottom:16px}
.group-head{display:flex;align-items:center;gap:8px;padding:5px 2px 7px;font-size:12px;font-weight:600;color:var(--text-2)}
.group-head .n{font-weight:400;color:var(--text-3);font-size:11px}
.row{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:6px;cursor:pointer}
.row:hover{border-color:var(--line-strong)}
.row.selected{border-color:color-mix(in srgb,var(--accent) 70%,var(--line));box-shadow:0 0 0 3px var(--accent-soft)}
.check{width:17px;height:17px;border-radius:50%;border:1.5px solid var(--line-strong);background:transparent;flex:0 0 auto;cursor:pointer;display:grid;place-items:center;color:transparent;padding:0}
.check:hover{border-color:var(--green);color:var(--green)}
.check.done{background:var(--green);border-color:var(--green);color:#fff}
.row-main{flex:1;min-width:0}
.row-title{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:7px}
.row.done-row .row-title{color:var(--text-3);text-decoration:line-through;font-weight:500}
.row-meta{font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:7px;margin-top:2px;flex-wrap:wrap}
.row-right{display:flex;align-items:center;gap:8px;color:var(--text-3);font-size:11px;flex:0 0 auto}
.sub-progress{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text-3)}
/* ---------- timeline ---------- */
.tl{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.tl-head{display:grid;grid-template-columns:92px 1fr;gap:0;padding:8px 12px;border-bottom:1px solid var(--line);font-size:11px;color:var(--text-3);background:var(--panel-2)}
.tl-row{display:grid;grid-template-columns:92px 1fr;border-bottom:1px solid var(--line)}
.tl-row:last-child{border-bottom:0}
.tl-time{padding:13px 12px;font-size:11px;color:var(--text-3);line-height:1.35;border-right:1px solid var(--line);font-variant-numeric:tabular-nums}
.tl-time b{display:block;color:var(--text-2);font-weight:600;font-size:11.5px}
.tl-body{padding:8px 10px;cursor:pointer}
.tl-body:hover{background:var(--hover)}
.tl-item{border-left:2px solid transparent;border-radius:0 7px 7px 0;padding:4px 8px 4px 10px;display:flex;align-items:flex-start;gap:10px}
.tl-item.doing{border-left-color:var(--green);background:var(--green-soft)}
.tl-item .ti-main{flex:1;min-width:0}
.tl-item .ti-title{font-size:12.5px;font-weight:600}
.tl-item .ti-meta{font-size:10.5px;color:var(--text-3);margin-top:2px}
.tl-item .ti-right{display:flex;align-items:center;gap:9px;flex:0 0 auto;padding-top:1px}
/* ---------- matrix ---------- */
.matrix{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.quad{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px;min-height:180px}
.quad h4{margin:0 0 2px;font-size:12.5px}
.quad .qsub{font-size:10.5px;color:var(--text-3);margin-bottom:8px}
.quad .mini{display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid var(--line);border-radius:7px;margin-bottom:6px;font-size:11.5px;cursor:pointer;background:var(--panel-2)}
.quad .mini:hover{border-color:var(--line-strong);background:var(--panel)}
/* ---------- calendar ---------- */
.cal-wrap{display:flex;gap:14px;align-items:flex-start}
.cal-main{flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.cal-top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line)}
.cal-top .range{font-size:11.5px;color:var(--text-2);margin-left:auto;display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.cal-scroll{overflow:auto;max-height:calc(100vh - 300px)}
.cal-grid{display:grid;grid-template-columns:56px repeat(7,minmax(96px,1fr));min-width:800px}
.cal-corner{border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.cal-dayh{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 6px;text-align:center;font-size:11px;color:var(--text-2)}
.cal-dayh b{display:block;font-size:12px;color:var(--text);font-weight:600}
.cal-dayh.today b{color:var(--accent-ink)}
.cal-dayh .cnt{font-size:10px;color:var(--text-3)}
.cal-gutter{border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:10px;color:var(--text-3);padding:5px 7px;text-align:right;font-variant-numeric:tabular-nums}
.cal-cell{position:relative;border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-height:52px}
.cal-cell.today{background:color-mix(in srgb,var(--accent-soft) 40%,transparent)}
.cal-ev{position:absolute;left:3px;right:3px;border-radius:5px;padding:3px 5px;font-size:10px;line-height:1.35;overflow:hidden;cursor:pointer;border-left:2px solid var(--ev,var(--accent));background:color-mix(in srgb,var(--ev,var(--accent)) 13%,var(--panel));color:var(--text)}
.cal-ev b{display:block;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cal-ev span{color:var(--text-3);font-size:9px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cal-allday{display:flex;align-items:center;gap:4px;padding:2px 0;flex-wrap:wrap}
.cal-rail{width:236px;flex:0 0 236px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px}
.rail-head{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:650;margin-bottom:2px}
.rail-sub{font-size:10.5px;color:var(--text-3);margin-bottom:9px}
.rail-item{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:6px;cursor:pointer;font-size:11.5px}
.rail-item:hover{background:var(--hover)}
.rail-item .t{width:38px;color:var(--text-3);font-size:10px;font-variant-numeric:tabular-nums}
.rail-item .rm{flex:1;min-width:0}
.rail-item .rm b{font-weight:600;font-size:11.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail-item .rm span{font-size:10px;color:var(--text-3)}
/* ---------- focus ---------- */
.focus-wrap{display:flex;gap:14px;align-items:flex-start}
.focus-card{flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.focus-card-top{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:650;margin-bottom:10px}
.focus-card-top .icon-btn{margin-left:auto}
.presets{display:flex;gap:5px;justify-content:center;margin:4px 0 16px}
.presets button{height:26px;padding:0 11px;border:1px solid var(--line);background:var(--panel);border-radius:6px;font-size:11.5px;color:var(--text-2);cursor:pointer}
.presets button.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 40%,var(--line));color:var(--accent-ink);font-weight:600}
.focus-center{display:flex;flex-direction:column;align-items:center}
.timer-ring{width:196px;height:196px;border-radius:50%;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--line) 0);display:grid;place-items:center;margin:6px 0 12px;position:relative}
.timer-ring::after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--panel)}
.timer-inner{position:relative;z-index:1;text-align:center}
.timer-time{font-size:40px;font-weight:300;letter-spacing:-1.5px;line-height:1;font-variant-numeric:tabular-nums}
.timer-lab{font-size:10.5px;color:var(--text-3);margin-top:5px}
.focus-task{font-size:11.5px;color:var(--text-2);margin-bottom:2px}
.focus-task b{display:block;font-size:13px;color:var(--text);font-weight:600;margin-top:2px}
.focus-btns{display:flex;gap:7px;margin-top:29px}
.btn{height:30px;padding:0 14px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--text-2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;flex:0 0 auto;line-height:1}
.btn svg{flex:0 0 auto}
.btn:hover{background:var(--hover);color:var(--text)}
.btn.solid{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600;min-width:92px;justify-content:center}
.btn.solid:hover{filter:brightness(1.06);color:#fff}
.focus-stats{display:flex;justify-content:center;gap:44px;border-top:1px solid var(--line);margin-top:18px;padding-top:12px;font-size:10.5px;color:var(--text-3);text-align:center}
.focus-stats b{display:block;font-size:14px;color:var(--text);font-weight:650;font-variant-numeric:tabular-nums}
.queue{width:292px;flex:0 0 292px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px;max-height:calc(100vh - 150px);overflow:auto}
.q-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:650;margin-bottom:7px}
.q-head .n{margin-left:auto;font-size:10.5px;color:var(--text-3);background:var(--panel-3);border-radius:5px;padding:0 6px}
.q-item{display:flex;align-items:flex-start;gap:8px;padding:7px 5px;border-radius:7px;cursor:pointer;border:1px solid transparent}
.q-item:hover{background:var(--hover)}
.q-item.active{border-color:color-mix(in srgb,var(--accent) 35%,var(--line));background:var(--accent-soft)}
.q-num{font-size:10px;color:var(--text-3);width:16px;flex:0 0 auto;padding-top:2px;font-variant-numeric:tabular-nums}
.q-main{flex:1;min-width:0}
.q-title{display:block;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q-meta{display:block;font-size:10px;color:var(--text-3);margin-top:1px}
/* ---------- stats ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;position:relative}
.kpi .k-top{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--text-3)}
.kpi .k-top svg{color:var(--text-3)}
.kpi .k-num{font-size:21px;font-weight:650;line-height:1.25;margin-top:5px;font-variant-numeric:tabular-nums}
.kpi .k-unit{font-size:10.5px;color:var(--text-3);font-weight:400}
.kpi .k-sub{font-size:10px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi .k-link{color:var(--accent-ink);cursor:pointer}
.stats-grid{display:grid;grid-template-columns:1fr 270px;gap:12px;margin-bottom:12px;align-items:stretch}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.panel-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:650;margin-bottom:2px}
.panel-h .n{margin-left:auto;font-size:10.5px;color:var(--text-3);font-weight:400}
.panel-sub{font-size:10.5px;color:var(--text-3);margin-bottom:12px}
.chart{height:150px;display:flex;align-items:flex-end;gap:14px;padding:0 4px;border-bottom:1px solid var(--line);position:relative}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px}
.bar{width:26px;border-radius:4px 4px 0 0;background:var(--accent);min-height:5px;position:relative;opacity:.9}
.bar span{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:9.5px;color:var(--text-3)}
.bar-x{display:flex;gap:14px;padding:6px 4px 0}
.bar-x div{flex:1;text-align:center;font-size:9.5px;color:var(--text-3)}
.structure{display:flex;flex-direction:column;gap:8px}
.struct-nums{display:flex;gap:26px;padding:4px 0 2px}
.struct-nums b{font-size:19px;font-weight:650;display:block;line-height:1.2}
.struct-nums span{font-size:10.5px;color:var(--text-3)}
.struct-bar{height:4px;border-radius:999px;background:var(--line);overflow:hidden;display:flex}
.struct-bar i{display:block;height:100%}
.insights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.insight{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 10px;display:flex;gap:8px;align-items:flex-start}
.insight .ii{width:24px;height:24px;border-radius:7px;background:var(--panel-3);display:grid;place-items:center;flex:0 0 auto;color:var(--text-2)}
.insight b{font-size:11.5px;font-weight:600;display:block;line-height:1.4}
.insight span{font-size:10.5px;color:var(--text-3);line-height:1.45;display:block;margin-top:1px}
.footnote{font-size:10.5px;color:var(--text-3);margin-top:12px;line-height:1.6}
/* ---------- detail ---------- */
.detail-tabs{display:flex;gap:2px;padding:10px 12px 0;border-bottom:1px solid var(--line);flex:0 0 auto}
.detail-tabs button{height:31px;padding:0 9px;border:0;background:transparent;color:var(--text-2);font-size:12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:5px}
.detail-tabs button.active{color:var(--text);font-weight:600;border-bottom-color:var(--text)}
.detail-tabs .n{font-size:10px;color:var(--text-3);background:var(--panel-3);border-radius:4px;padding:0 4px}
.detail-body{padding:12px 14px 20px;flex:1}
.d-head{display:flex;align-items:center;gap:4px;color:var(--text-3);font-size:10.5px;margin-bottom:6px}
.d-head .acts{margin-left:auto;display:flex;gap:0}
.d-title-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:12px}
.d-title-row .check{margin-top:3px}
.d-title{font-size:15px;font-weight:650;line-height:1.4;flex:1;outline:0;border-radius:4px}
.d-title:focus{box-shadow:0 0 0 2px var(--accent-soft)}
.field{display:grid;grid-template-columns:68px 1fr;gap:8px;align-items:center;padding:5px 0;font-size:11.5px;border-bottom:1px solid var(--line)}
.field:last-of-type{border-bottom:0}
.field .fl{color:var(--text-3);display:flex;align-items:center;gap:5px;font-size:10.5px}
.field .fv{display:flex;align-items:center;gap:6px;color:var(--text);min-width:0;flex-wrap:wrap}
.field .fv .muted{font-size:10.5px}
.tag{font-size:10.5px;color:var(--accent-ink);background:var(--accent-soft);border-radius:4px;padding:1px 5px}
.d-sec{margin-top:14px}
.d-sec-h{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2);font-weight:600;margin-bottom:6px}
.d-note{font-size:11.5px;color:var(--text-2);line-height:1.6;white-space:pre-wrap;background:var(--panel-2);border:1px solid var(--line);border-radius:7px;padding:8px}
.attach-row{display:flex;gap:6px;margin-bottom:7px;align-items:center;font-size:10.5px;color:var(--text-3)}
.attach-row .btn{height:23px;padding:0 7px;font-size:10.5px;border-radius:5px}
.attachments{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.attach{border:1px solid var(--line);border-radius:7px;padding:7px;display:flex;align-items:center;gap:6px;font-size:10.5px;background:var(--panel-2);position:relative}
.attach .x{position:absolute;right:3px;top:2px;color:var(--text-3);cursor:pointer;font-size:11px;line-height:1}
.file-ic{width:24px;height:24px;border-radius:5px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);font-size:8.5px;font-weight:700;color:var(--text-2)}
.next-item{display:flex;gap:8px;align-items:center;font-size:11px;padding:5px 0;border-bottom:1px solid var(--line);cursor:pointer}
.next-item:last-child{border-bottom:0}
.next-item .t{color:var(--text-3);font-size:10px;width:36px;font-variant-numeric:tabular-nums}
.next-item:hover{color:var(--accent-ink)}
.sub-item{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)}
.sub-item .sm{flex:1;min-width:0}
.sub-item .st{font-size:11.5px;line-height:1.4}
.sub-item.done .st{color:var(--text-3);text-decoration:line-through}
.sub-item .sm span{display:block;font-size:10px;color:var(--text-3);margin-top:2px;font-variant-numeric:tabular-nums}
.sub-add{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:11px;color:var(--text-3)}
.sub-add input{flex:1;height:28px;border:1px solid var(--line);background:var(--panel-2);border-radius:6px;padding:0 8px;font:inherit;font-size:11px;color:var(--text);outline:0}
.sub-add input:focus{border-color:var(--accent)}
.plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.plan-box{font-size:10px;color:var(--text-3);border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--panel-2)}
.plan-box b{display:block;color:var(--text-2);font-weight:600;font-size:10px;margin-top:1px;font-variant-numeric:tabular-nums}
.log{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:11px;color:var(--text-2)}
.log .lt{color:var(--text-3);font-size:10px;width:74px;flex:0 0 auto;font-variant-numeric:tabular-nums}
.detail-empty{padding:40px 20px;text-align:center;color:var(--text-3);font-size:11.5px;line-height:1.7}
/* ---------- modal ---------- */
.overlay{position:fixed;inset:0;background:rgba(15,15,22,.35);display:grid;place-items:center;z-index:100;backdrop-filter:blur(2px)}
.modal{width:420px;max-height:calc(100vh - 60px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:16px}
.modal.modal-wide{width:auto;min-width:min(680px,calc(100vw - 48px));max-width:calc(100vw - 48px)}
.modal h3{margin:0 0 12px;font-size:14px}
.mfield{margin-bottom:9px}
.mfield label{display:block;font-size:10.5px;color:var(--text-3);margin-bottom:3px}
.mfield input,.mfield select,.mfield textarea{width:100%;height:33px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);padding:0 9px;font:inherit;font-size:12px;color:var(--text);outline:0}
.mfield textarea{height:64px;padding:7px 9px;resize:vertical}
.mfield textarea.dispatch-prompt{height:170px;font:11.5px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}
.mfield input:focus,.mfield select:focus,.mfield textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.mrow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.modal-foot{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:12px}
.modal-foot .btn.solid{min-width:0}
.modal-foot.bug-foot{flex-wrap:nowrap}
.modal-foot.bug-foot .btn{padding:0 9px;gap:4px;font-size:11.5px}
.modal-foot.bug-foot .btn.solid{padding:0 12px}
.modal-foot.bug-foot > .btn:first-child{margin-right:auto}
.switch-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:12px}
.switch-row:last-child{border-bottom:0}
.switch{width:34px;height:19px;border-radius:999px;background:var(--line-strong);border:0;position:relative;cursor:pointer;transition:background .15s}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .15s}
.switch.on{background:var(--accent)}
.switch.on::after{transform:translateX(15px)}
.toast{position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--panel);font-size:11.5px;padding:7px 13px;border-radius:8px;z-index:120;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:translateX(-50%) translateY(-4px)}
@media (max-width:1180px){.detail{width:292px;flex-basis:292px}.kpis{grid-template-columns:repeat(2,1fr)}}

/* ---------- plugin additions ---------- */
:host{overflow:hidden}
.wb-loading,.wb-error{height:100%;display:grid;place-items:center;background:var(--bg);color:var(--text-2);font-size:12.5px;gap:10px}
.wb-error{color:var(--text)}
.wb-error button{margin-top:10px}
.spin{width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:wbspin .8s linear infinite}
@keyframes wbspin{to{transform:rotate(360deg)}}
.save.err{color:var(--red)} .save.err i{background:var(--red)}
.save.busy i{background:var(--amber)}
.attach-hidden{display:none}
.mini-seg{display:flex;gap:2px;padding:2px;border:1px solid var(--line);background:var(--panel);border-radius:8px}
.mini-seg button{height:24px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--text-2);font-size:11px;cursor:pointer}
.mini-seg button.active{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
.month-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.month-head{padding:7px 6px;font-size:10.5px;color:var(--text-3);text-align:center;border-bottom:1px solid var(--line);background:var(--panel-2)}
.month-cell{min-height:86px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px;font-size:10px;cursor:pointer}
.month-cell:nth-child(7n){border-right:0}
.month-cell:hover{background:var(--hover)}
.month-cell.dim{opacity:.45}
.month-cell.today{background:color-mix(in srgb,var(--accent-soft) 55%,transparent)}
.month-cell .d{font-size:10.5px;color:var(--text-2);font-weight:600;margin-bottom:2px;font-variant-numeric:tabular-nums}
.month-cell .me{display:flex;align-items:center;gap:3px;margin-top:2px;font-size:9.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.month-cell .me i{width:5px;height:5px;border-radius:50%;display:block;flex:0 0 auto}
.year-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.year-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px}
.year-card h5{margin:0 0 6px;font-size:11.5px;display:flex;justify-content:space-between;color:var(--text-2)}
.year-card h5 span{color:var(--text-3);font-weight:400}
.year-mini{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.year-mini i{aspect-ratio:1;border-radius:2px;background:var(--panel-3);display:block}
.year-mini i.has{background:color-mix(in srgb,var(--accent) 55%,var(--panel))}
.cal-cell .cal-ev{cursor:pointer}

/* sidebar collapse */
.sidebar{transition:width .16s ease,flex-basis .16s ease}
.app.collapsed .sidebar{width:56px;flex:0 0 56px;padding:12px 6px}
.app.collapsed .brand{justify-content:center;padding:2px 0 13px}
.app.collapsed .brand-t,.app.collapsed .brand-s,.app.collapsed .brand-collapse{display:none}
.app.collapsed .side-head{justify-content:center;font-size:0}
.app.collapsed .side-head .count,.app.collapsed .side-head .add{display:none}
.app.collapsed .side-item{justify-content:center;padding:0;gap:0}
.app.collapsed .side-item > span:not(.dot){display:none}
.app.collapsed .side-item .n{display:none}
.app.collapsed .side-sub{display:none}
.app.collapsed .side-foot{justify-content:center;padding-left:0;padding-right:0}
.app.collapsed .side-foot > div:last-child{display:none}

/* 侧栏宽度拖拽：把手贴在侧栏右缘，宽度由 --wb-side-w 驱动 */
.side-resizer{position:absolute;top:0;bottom:0;left:var(--wb-side-w,200px);width:9px;transform:translateX(-4px);cursor:col-resize;z-index:7;touch-action:none}
.side-resizer::after{content:'';position:absolute;top:0;bottom:0;left:4px;width:1px;background:transparent;transition:background .12s}
.side-resizer:hover::after,.app.resizing .side-resizer::after{background:color-mix(in srgb,var(--accent) 60%,transparent)}
.app.resizing,.app.resizing .sidebar{cursor:col-resize;user-select:none}
.app.resizing .sidebar{transition:none}
.app.collapsed .side-resizer{display:none}

/* ---------- DSH 面板内适配（200+300 两栏） ---------- */
.sidebar{width:var(--wb-side-w,200px);flex:0 0 var(--wb-side-w,200px)}
.detail{width:300px;flex:0 0 300px}
.content{padding:18px 20px 48px}
/* 灵感视图：占满内容区，隐藏任务详情栏（灵感自带右栏） */
.app.idea-mode .detail{display:none}
.app.idea-mode .content{padding:0;overflow:hidden;position:relative}
#wb-idea-root{height:100%;min-height:0}
.kanban{gap:12px}
.card-foot{flex-wrap:nowrap;overflow:hidden}
.card-foot > span:first-child{white-space:nowrap}
.card-foot .sync{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:1250px){
  .sidebar{width:var(--wb-side-w,190px);flex-basis:var(--wb-side-w,190px)}
  .detail{width:280px;flex-basis:280px}
  h1.page-title{font-size:26px}
  .content{padding:16px 16px 44px}
}

/* 侧栏拖拽把手的定位基准 */
.app{position:relative}
.cal-grid{grid-template-columns:52px repeat(7,minmax(84px,1fr));min-width:700px}
@media (max-width:1250px){
  .cal-grid{min-width:660px}
}

/* compact density */
.app.compact .content{padding-top:12px}
.app.compact .view-head{margin-bottom:8px}
.app.compact .task-card{padding:7px 8px;margin-bottom:6px}
.app.compact .task-card h3{margin:4px 0 3px}
.app.compact .row{padding:6px 9px;margin-bottom:4px}
.app.compact .kanban{gap:10px}
.app.compact .col{padding:7px}
.app.compact .card-foot{margin-top:5px}
.app.compact .group{margin-bottom:10px}
.app.compact .tl-time{padding:9px 12px}
.app.compact .tl-body{padding:5px 10px}
/* focus immersive */
.app.focus-expand .queue{display:none}
.app.focus-expand .focus-wrap{justify-content:center}
.app.focus-expand .focus-card{max-width:820px;width:100%}
.presets{flex-wrap:wrap}
/* subtask note editor */
.sub-note-input{width:100%;min-height:54px;margin:4px 0 2px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text);font:11px/1.5 var(--font);padding:6px 8px;resize:vertical;outline:0}
.sub-note-input:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}

/* clickable task fields */
.field[data-act]{cursor:pointer;border-radius:6px;margin:0 -4px;padding-left:4px;padding-right:4px}
.field[data-act]:hover{background:var(--hover)}
.field[data-act]:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

/* ---------- news ---------- */
.news-banner{display:flex;align-items:center;gap:8px;background:var(--amber-soft);color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 35%,var(--line));border-radius:9px;padding:8px 10px;font-size:11px;line-height:1.5;margin-bottom:10px}
.news-banner span{flex:1;min-width:0}
.news-banner code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;background:color-mix(in srgb,var(--amber) 10%,transparent);padding:1px 4px;border-radius:3px}
.news-stats{display:flex;align-items:center;gap:15px;flex-wrap:wrap;font-size:11px;color:var(--text-3);margin-bottom:12px}
.news-stats b{font-size:12.5px;color:var(--text);font-weight:650;font-variant-numeric:tabular-nums;margin-right:2px}
.news-topics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}
.news-topic-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 11px;display:flex;flex-direction:column;gap:4px;min-width:0}
.nt-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.nt-top b{font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nt-query,.nt-meta{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nt-query svg,.nt-meta svg{flex:0 0 auto;opacity:.8}
.nt-actions{display:flex;align-items:center;gap:4px;border-top:1px solid var(--line);margin-top:6px;padding-top:7px}
.nt-actions .btn{height:24px;padding:0 8px;font-size:10.5px;gap:4px}
.nt-actions .icon-btn{width:24px;height:24px}
.news-feed-head{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 8px}
.news-feed-head b{font-size:13px;font-weight:650}
.news-filters{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.news-list{display:flex;flex-direction:column;gap:8px}
.news-item{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 11px}
.ni-meta{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text-3);margin-bottom:4px;flex-wrap:wrap}
.news-topic-tag{background:var(--accent-soft);color:var(--accent-ink);border-radius:4px;padding:1px 5px;font-size:10px;font-weight:500}
.ni-title{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;line-height:1.45;color:var(--text);text-decoration:none}
.ni-title svg{flex:0 0 auto;opacity:.55}
.ni-title:hover{color:var(--accent-ink)}
.news-item p{margin:4px 0 0;font-size:11px;line-height:1.55;color:var(--text-2)}
.news-empty{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;border:1px dashed var(--line);border-radius:12px;padding:30px 18px;background:var(--panel-2);color:var(--text-3);font-size:11px;line-height:1.6}
.news-empty b{font-size:13px;color:var(--text)}
.news-empty .btn-primary{margin-top:5px}
.news-empty.small{padding:20px 16px}
.ne-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-ink);margin-bottom:2px}
@media (max-width:1180px){.news-topics{grid-template-columns:1fr}}

/* ---------- news: preset topics + Xiaohongshu-style waterfall ---------- */
.news-presets{display:flex;flex-wrap:wrap;gap:5px}
.news-presets .chip{height:24px;padding:0 9px;font-size:10.5px;border:1px solid var(--line);background:var(--panel);color:var(--text-2)}
.news-presets .chip:hover{border-color:color-mix(in srgb,var(--accent) 35%,var(--line));background:var(--accent-soft);color:var(--accent-ink)}
.news-list{display:block;columns:3;column-gap:10px}
.news-list .news-item{display:inline-block;width:100%;break-inside:avoid;page-break-inside:avoid;margin:0 0 10px;padding:11px 12px;border:1px solid var(--line);border-top:3px solid var(--card-accent,var(--accent));border-radius:12px;background:var(--panel);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.news-list .news-item:hover{border-color:color-mix(in srgb,var(--card-accent,var(--accent)) 30%,var(--line));border-top-color:var(--card-accent,var(--accent))}
.news-list .ni-meta{margin-bottom:5px}
.news-list .ni-title{font-size:12.8px;line-height:1.5;font-weight:650}
.ni-ai{margin-top:9px;padding:8px 9px 9px;border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,var(--panel-2));border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line))}
.ni-ai.plain{background:var(--panel-2);border-color:var(--line)}
.ni-ai-head{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:650;color:var(--accent-ink);margin-bottom:4px;letter-spacing:.01em}
.ni-ai.plain .ni-ai-head{color:var(--text-3)}
.ni-ai p{margin:0;font-size:11.5px;line-height:1.65;color:var(--text-2);white-space:pre-wrap}
.ni-foot{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:9px;padding-top:7px;border-top:1px solid var(--line);font-size:10px;color:var(--text-3)}
.ni-foot a{margin-left:auto;color:var(--accent-ink);text-decoration:none;white-space:nowrap}
.ni-foot a:hover{text-decoration:underline}
.news-feed-head b{font-size:13.5px}
@media (max-width:1250px){.news-list{columns:2}}
@media (max-width:950px){.news-list{columns:1}}

/* ---------- notes / notebook ---------- */
.notes-wrap{display:grid;grid-template-columns:286px minmax(0,1fr);gap:12px;height:calc(100vh - 238px);min-height:480px}
.notes-side{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;min-height:0}
.notes-search{height:32px;border:1px solid var(--line);background:var(--panel-2);border-radius:8px;display:flex;align-items:center;gap:7px;padding:0 9px;color:var(--text-3)}
.notes-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font:12px var(--font)}
.notes-filters{display:flex;gap:4px;flex-wrap:wrap;max-height:56px;overflow:auto}
.notes-filters .chip{height:23px;padding:0 7px;font-size:10.5px}
.notes-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:5px;padding-right:2px}
.note-row{border:1px solid transparent;border-radius:8px;padding:7px 8px;cursor:pointer;min-width:0}
.note-row:hover{background:var(--hover)}
.note-row.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.note-row-top{display:flex;align-items:center;gap:5px}
.note-row-title{flex:1;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px}
.note-row-title svg{color:var(--accent);flex:0 0 auto}
.note-row-time{font-size:9.5px;color:var(--text-3);flex:0 0 auto}
.note-row-snip{margin-top:3px;font-size:10.5px;line-height:1.45;color:var(--text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.note-row-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.note-row-tags span{font-size:9.5px;color:var(--accent-ink);background:var(--accent-soft);border-radius:4px;padding:0 4px}
.notes-side-foot{border-top:1px solid var(--line);padding-top:7px;font-size:10px;color:var(--text-3)}
.notes-editor{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;min-height:0;min-width:0}
.notes-editor.empty{display:grid;place-items:center}
.note-head{display:flex;align-items:center;gap:8px}
.note-title-input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:22px;font-weight:700;letter-spacing:-.3px;padding:2px 0;font-family:var(--font)}
.note-title-input::placeholder{color:var(--text-3)}
.note-actions{display:flex;align-items:center;gap:3px;flex:0 0 auto}
.note-actions .icon-btn{width:27px;height:27px}
.note-actions .icon-btn.on{background:var(--accent-soft);color:var(--accent-ink)}
.note-actions .btn{height:27px;padding:0 8px;font-size:10.5px}
.note-tags-input{width:100%;height:26px;border:0;border-bottom:1px solid var(--line);outline:0;background:transparent;color:var(--text-2);font:11px var(--font);padding:0 1px;margin-top:2px}
.note-tags-input::placeholder{color:var(--text-3)}
.note-toolbar{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--line);margin-bottom:4px}
.note-toolbar .btn{height:25px;padding:0 8px;font-size:10.5px;gap:4px;margin-left:auto}
.note-save-state{font-size:10px;color:var(--green);white-space:nowrap}
.note-save-state.busy{color:var(--amber)}
.note-save-state.err{color:var(--red)}
.note-words{font-size:10px;color:var(--text-3);white-space:nowrap}
.notes-preview{font-size:12.5px;line-height:1.7;color:var(--text);overflow:auto;flex:1;min-height:0;padding:8px 2px 12px}
.notes-preview h1,.notes-preview h2,.notes-preview h3,.notes-preview h4{margin:14px 0 6px;line-height:1.35;letter-spacing:-.2px}
.notes-preview h1{font-size:21px;border-bottom:1px solid var(--line);padding-bottom:6px}
.notes-preview h2{font-size:17px}
.notes-preview h3{font-size:14px}
.notes-preview p{margin:6px 0;color:var(--text-2)}
.notes-preview ul,.notes-preview ol{margin:6px 0;padding-left:20px;color:var(--text-2)}
.notes-preview li{margin:2px 0}
.notes-preview blockquote{margin:8px 0;padding:5px 10px;border-left:3px solid var(--accent);background:var(--panel-2);color:var(--text-2);border-radius:0 6px 6px 0}
.notes-preview code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--panel-3);border-radius:4px;padding:1px 4px}
.notes-preview table{border-collapse:collapse;margin:8px 0;font-size:11.5px;width:100%}
.notes-preview th,.notes-preview td{border:1px solid var(--line);padding:4px 8px;text-align:left;color:var(--text-2)}
.notes-preview th{background:var(--panel-2);color:var(--text);font-weight:600}
.notes-preview pre{background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 11px;overflow:auto;margin:8px 0}
.notes-preview pre code{background:none;padding:0;font-size:11px;line-height:1.6}
.notes-preview a{color:var(--accent-ink);text-decoration:none}
.notes-preview a:hover{text-decoration:underline}
.notes-preview img{max-width:100%;border-radius:8px;margin:6px 0}
.notes-preview hr{border:0;border-top:1px solid var(--line);margin:12px 0}
.notes-preview .md-task{list-style:none;margin-left:-16px}
.notes-preview .md-check{color:var(--accent-ink);margin-right:4px}
.notes-preview .muted{color:var(--text-3)}
.notes-preview h1:first-child,.notes-preview h2:first-child,.notes-preview p:first-child{margin-top:0}
.note-textarea{flex:1;min-height:300px;width:100%;border:0;outline:0;resize:none;background:transparent;color:var(--text);font:12.5px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px 2px}
.note-textarea::placeholder{color:var(--text-3)}
.note-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:6px;font-size:9.5px;color:var(--text-3)}
.notes-empty{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;border:1px dashed var(--line);border-radius:12px;padding:26px 16px;background:var(--panel-2);color:var(--text-3);font-size:11px;line-height:1.6}
.notes-empty b{font-size:13px;color:var(--text)}
.notes-empty .btn-primary{margin-top:4px}
.notes-empty.small{padding:16px 10px;border:0;background:transparent;font-size:10.5px}
@media (max-width:1250px){.notes-wrap{grid-template-columns:240px minmax(0,1fr)}}
@media (max-width:950px){.notes-wrap{grid-template-columns:210px minmax(0,1fr);height:calc(100vh - 220px)}}

/* ---------- notebook select / export ---------- */
.notes-nb-row{display:flex;align-items:center;gap:4px}
.notes-nb-select{flex:1;min-width:0;height:30px;border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:7px;padding:0 6px;font:11px var(--font);outline:0}
.notes-nb-row .icon-btn{width:27px;height:27px;flex:0 0 auto}
.note-meta-row{display:flex;align-items:center;gap:7px;margin-top:3px}
.note-notebook-select{height:25px;max-width:118px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text-2);font:10.5px var(--font);padding:0 5px;outline:0;flex:0 0 auto}
.note-meta-row .note-tags-input{flex:1;margin-top:0}
.note-row-nb{color:var(--text-3)!important;background:var(--panel-2)!important;border:1px solid var(--line)}
.nb-create-row{display:flex;align-items:center;gap:6px}
.nb-create-row input{flex:1;min-width:0}
.nb-list{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto;margin-top:2px}
.nb-row{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:8px;padding:7px 8px;background:var(--panel-2)}
.nb-name{flex:1;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nb-count{font-size:10px;color:var(--text-3);flex:0 0 auto}
.nb-row .btn{height:24px;padding:0 7px;font-size:10px}
.nb-row .icon-btn{width:25px;height:25px}
.export-result{border:1px solid var(--line);border-radius:10px;background:var(--panel-2);padding:12px}
.export-name{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--text);word-break:break-all}
.export-name svg{color:var(--accent);flex:0 0 auto}
.export-path{margin-top:7px;font-size:10.5px;line-height:1.55;color:var(--text-3);word-break:break-all;user-select:text}
.export-hint{color:var(--text-3);font-size:10px;line-height:1.55;margin-top:5px}

/* ---------- bug board (Teambition-like) ---------- */
.bug-head-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.bug-head-actions .btn,.bug-head-actions .btn-primary{height:30px;padding:0 10px;font-size:11px;gap:5px}
.bug-toolbar{display:flex;align-items:center;gap:6px;margin:2px 0 10px}
.bug-project-select{height:30px;min-width:170px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text);font:11px var(--font);padding:0 7px;outline:0}
.bug-search{flex:1;min-width:160px;height:30px;border:1px solid var(--line);background:var(--panel);border-radius:7px;display:flex;align-items:center;gap:6px;padding:0 9px;color:var(--text-3)}
.bug-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font:11.5px var(--font)}
.bug-stats{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin-bottom:9px}
.bug-stat{min-width:42px;text-align:center}
.bug-stat b{display:block;font-size:17px;line-height:1.1;font-weight:700}
.bug-stat span{font-size:9.5px;color:var(--text-3);white-space:nowrap}
.bug-progress-wrap{min-width:120px;flex:1;max-width:220px;margin-left:6px}
.bug-progress-label{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-3);margin-bottom:3px}
.bug-progress{height:5px;border-radius:99px;background:var(--panel-3);overflow:hidden}
.bug-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--accent))}
.bug-sev-stats{display:flex;gap:8px;flex-wrap:wrap;font-size:10px;margin-left:auto;white-space:nowrap}
.bug-batch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:9px;padding:7px 10px;margin-bottom:9px;font-size:11px}
.bug-batch b{margin-right:4px;color:var(--accent-ink)}
.bug-batch .btn{height:26px;padding:0 8px;font-size:10.5px;gap:4px}
.bug-board{display:grid;grid-template-columns:repeat(4,minmax(215px,1fr));gap:9px;align-items:start;overflow-x:auto;padding-bottom:14px}
.bug-col{background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:7px;min-width:0}
.bug-col>header{display:flex;align-items:center;gap:6px;padding:3px 3px 8px;color:var(--text-2)}
.bug-col>header b{font-size:11.5px;color:var(--text)}
.bug-col-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.bug-col-count{font-size:10px;color:var(--text-3);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:0 6px}
.bug-col>header .icon-btn{width:22px;height:22px;margin-left:auto}
.bug-col-body{display:flex;flex-direction:column;gap:6px;min-height:44px}
.bug-col-empty{border:1px dashed var(--line);border-radius:8px;padding:12px 8px;text-align:center;color:var(--text-3);font-size:10px}
.bug-card{position:relative;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:9px;padding:8px 9px 7px;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s}
.bug-card:hover{border-color:color-mix(in srgb,var(--accent) 30%,var(--line));box-shadow:0 3px 10px rgba(0,0,0,.06)}
.bug-card.selected{border-color:var(--accent);background:var(--accent-soft)}
.bug-card[data-status="open"]{border-left-color:var(--text-3)}
.bug-card[data-status="doing"]{border-left-color:var(--blue)}
.bug-card[data-status="verify"]{border-left-color:var(--amber)}
.bug-card[data-status="resolved"]{border-left-color:var(--green)}
.bug-card-top{display:flex;align-items:center;gap:5px;margin-bottom:5px}
.bug-check{width:16px;height:16px;border-radius:4px;border:1px solid var(--line-strong);background:var(--panel);color:#fff;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;padding:0;cursor:pointer}
.bug-check.on{background:var(--accent);border-color:var(--accent)}
.bug-check svg{width:10px;height:10px}
.bug-code{font-size:9px;color:var(--text-3);font-family:ui-monospace,Menlo,monospace}
.bug-priority{font-size:9px;font-weight:700;border-radius:4px;padding:0 4px;line-height:15px;background:var(--panel-3);color:var(--text-2)}
.bug-priority.P0{background:color-mix(in srgb,var(--red) 18%,var(--panel));color:var(--red)}
.bug-priority.P1{background:color-mix(in srgb,var(--orange) 16%,var(--panel));color:var(--orange)}
.bug-sev{font-size:9px;margin-left:auto}
.bug-ai{display:inline-flex;align-items:center;gap:2px;font-size:8.5px;color:var(--accent-ink);background:var(--accent-soft);border-radius:99px;padding:0 4px;line-height:14px}
.bug-title{font-size:12px;font-weight:600;line-height:1.45;color:var(--text);word-break:break-word}
.bug-desc{margin-top:3px;font-size:10.5px;line-height:1.5;color:var(--text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bug-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
.bug-tags span{font-size:9px;color:var(--accent-ink);background:var(--accent-soft);border-radius:4px;padding:0 4px}
.bug-card-foot{display:flex;align-items:center;gap:5px;margin-top:7px;padding-top:6px;border-top:1px solid var(--line);font-size:9.5px;color:var(--text-3)}
.bug-avatar{width:16px;height:16px;border-radius:50%;background:var(--panel-3);color:var(--text-2);display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;flex:0 0 auto}
.bug-project-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bug-due{margin-left:auto;display:inline-flex;align-items:center;gap:2px;white-space:nowrap}
.bug-due.overdue{color:var(--red)}
.bug-empty{min-height:260px;margin-top:8px}
.bug-detail-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--text-3);font-size:10px;margin:-2px 0 8px;word-break:break-all}
.bug-detail-status{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px}
.bug-detail-status .chip{height:24px;font-size:10.5px}
.bug-detail-text{border:1px solid var(--line);background:var(--panel-2);border-radius:7px;padding:7px 9px;font-size:11.5px;line-height:1.6;color:var(--text-2);white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto}
.bug-detail-text.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px}
.nb-ws{display:block;font-size:9px;color:var(--text-3);font-weight:400;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:1250px){.bug-board{grid-template-columns:repeat(4,minmax(190px,1fr))}.bug-stats{gap:6px}.bug-sev-stats{margin-left:0}}

/* ---------- product design ---------- */
.product-toolbar{display:flex;align-items:center;gap:7px;margin:2px 0 9px;flex-wrap:wrap}
.product-ws{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-3);max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.product-tabs{display:flex;gap:3px;border-bottom:1px solid var(--line);margin-bottom:10px}
.product-tabs button{height:32px;padding:0 12px;border:0;background:transparent;color:var(--text-3);font:11.5px var(--font);border-bottom:2px solid transparent;cursor:pointer}
.product-tabs button.active{color:var(--accent-ink);border-bottom-color:var(--accent);font-weight:600}
.product-map-toolbar{display:flex;align-items:center;gap:5px;margin-bottom:8px;flex-wrap:wrap}
.product-map-toolbar .btn{height:27px;padding:0 8px;font-size:10.5px;gap:4px}
.product-hint{margin-left:auto;font-size:9.5px;color:var(--text-3);max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:4px}
.pm-canvas{background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:auto;max-height:calc(100vh - 260px);padding:8px}
.pm-canvas svg{display:block;width:auto;height:auto}
.pm-edge{fill:none;stroke:var(--accent);stroke-width:1.4;opacity:.32}
.pm-node rect{fill:var(--panel-2);stroke:var(--line);stroke-width:1;cursor:pointer;transition:fill .15s,stroke .15s}
.pm-node:hover rect{stroke:var(--accent)}
.pm-node.active rect{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.pm-node.root rect{fill:var(--accent-soft);stroke:color-mix(in srgb,var(--accent) 35%,var(--line))}
.pm-node.requirement rect{fill:var(--panel)}
.pm-type{fill:var(--text-3);font-size:8.5px;font-family:var(--font);letter-spacing:.04em}
.pm-label{fill:var(--text);font-size:11.5px;font-family:var(--font);font-weight:600}
.pm-fold{cursor:pointer}
.pm-fold-circle{fill:var(--panel);stroke:var(--accent);stroke-width:1.2}
.pm-fold:hover .pm-fold-circle{fill:var(--accent-soft)}
.pm-fold-mark{fill:var(--accent);font-size:11px;font-family:var(--font);font-weight:700;pointer-events:none}
.pm-sep{width:1px;height:16px;background:var(--line);margin:0 3px;flex:none}
.pm-layout-seg{height:27px;padding:2px}
.pm-layout-seg button{height:21px;padding:0 8px;font-size:10.5px;border-radius:5px}
/* ---------- 多导图清单 ---------- */
.pm-map-wrap{display:grid;grid-template-columns:186px minmax(0,1fr);gap:10px;align-items:start}
.pm-maps{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:7px;display:flex;flex-direction:column;gap:4px;max-height:calc(100vh - 260px);overflow:auto}
.pm-maps-head{display:flex;align-items:center;gap:5px;padding:2px 4px 5px;border-bottom:1px solid var(--line);margin-bottom:3px}
.pm-maps-head b{font-size:11.5px;font-weight:650}
.pm-maps-head span{font-size:9.5px;color:var(--text-3);background:var(--panel-3);border-radius:999px;padding:1px 6px}
.pm-maps-head .icon-btn{margin-left:auto;width:22px;height:22px}
.pm-maps-empty{padding:10px 6px;color:var(--text-3);font-size:10px;line-height:1.6;text-align:center}
.pm-map{position:relative;display:flex;flex-direction:column;gap:1px;padding:6px 7px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .13s,border-color .13s}
.pm-map:hover{background:var(--hover)}
.pm-map.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 34%,var(--line))}
.pm-map b{font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:34px}
.pm-map small{font-size:9.5px;color:var(--text-3)}
.pm-map-ops{position:absolute;right:4px;top:4px;display:none;gap:1px}
.pm-map:hover .pm-map-ops,.pm-map.active .pm-map-ops{display:flex}
.pm-map-ops .icon-btn{width:20px;height:20px;border-radius:5px}
.pm-map-main{min-width:0}
@media (max-width:1180px){.pm-map-wrap{grid-template-columns:1fr}.pm-maps{flex-direction:row;flex-wrap:wrap;max-height:none}.pm-map{min-width:150px}}
.pm-canvas.pm-layout-radial{display:flex;justify-content:center}
.pm-canvas.pm-layout-bilateral svg{margin:0 auto}
/* ---------- 节点右键菜单 ---------- */
.ctxmenu{position:fixed;z-index:60;display:none;min-width:196px;padding:5px;background:var(--panel);border:1px solid var(--line-strong);border-radius:10px;box-shadow:0 14px 38px rgba(16,16,28,.18);font-size:12px}
.ctxmenu.open{display:block}
.ctx-head{padding:5px 9px 6px;color:var(--text-3);font-size:10px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.ctx-item{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 9px;border:0;border-radius:6px;background:none;color:var(--text);font:12px var(--font);cursor:pointer;text-align:left}
.ctx-item:hover{background:var(--hover)}
.ctx-item svg{color:var(--text-3);flex:none}
.ctx-item kbd{margin-left:auto;font:10px var(--font);color:var(--text-3)}
.ctx-item.danger{color:var(--red)}
.ctx-item.danger svg{color:var(--red)}
.ctx-item.danger:hover{background:var(--red-soft)}
.pm-zoom-val{font-size:9.5px;color:var(--text-3);min-width:32px;text-align:center}
.product-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.product-panel-head b{font-size:13px;color:var(--text)}
.product-panel-head span{display:block;font-size:9.5px;color:var(--text-3);margin-top:1px}
.product-panel-head .btn-primary,.product-panel-head .btn{height:28px;padding:0 9px;font-size:10.5px;gap:4px}
.product-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.product-actions .notes-nb-select{height:28px;max-width:120px}
.product-pick-list{display:flex;gap:4px;flex-wrap:wrap;border:1px solid var(--line);border-radius:9px;padding:7px 9px;margin-bottom:8px;max-height:92px;overflow:auto;background:var(--panel)}
.product-pick-list label{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text-2);background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:3px 6px}
.product-pick-list input{accent-color:var(--accent);width:12px;height:12px}
.product-note-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.product-note{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:8px 10px;cursor:pointer;min-width:0}
.product-note:hover{border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.product-note b{display:block;font-size:11.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.product-note span{display:block;margin-top:3px;font-size:10px;line-height:1.5;color:var(--text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.product-note i{display:block;margin-top:4px;font-style:normal;font-size:9px;color:var(--green)}
.product-demo-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:9px;min-height:420px}
.product-demo-list{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:7px;display:flex;flex-direction:column;gap:4px;max-height:calc(100vh - 250px);overflow:auto}
.product-demo-row{border:1px solid transparent;border-radius:7px;padding:6px 7px;cursor:pointer;position:relative}
.product-demo-row:hover{background:var(--hover)}
.product-demo-row.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.product-demo-row b{display:block;font-size:10.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.product-demo-row span{display:block;margin-top:2px;font-size:9px;color:var(--text-3)}
.product-demo-row .icon-btn{position:absolute;top:5px;right:5px;opacity:0;transition:opacity .15s}
.product-demo-row:hover .icon-btn{opacity:1}
.product-demo-preview{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;min-height:420px;display:flex;flex-direction:column}
.demo-viewport-bar{display:flex;align-items:center;gap:5px;padding:5px 8px;border-bottom:1px solid var(--line);background:var(--panel-2)}
.demo-viewport-bar button{font-size:9.5px;padding:3px 9px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--text-3);cursor:pointer}
.demo-viewport-bar button.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,var(--line));color:var(--text)}
.demo-viewport-bar span{margin-left:auto;font-size:9px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
.product-demo-preview .demo-frame{flex:1;width:100%;border:0;background:#fff;min-height:480px;transition:width .2s}
.demo-frame-pc{width:100%}
.demo-frame-tablet{width:834px;align-self:center;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.demo-frame-mobile{width:390px;align-self:center;border-left:1px solid var(--line);border-right:1px solid var(--line)}
/* Demo 生成进度 */
.demo-progress{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 11px;margin:0 0 8px}
.demo-progress.failed{border-color:color-mix(in srgb,var(--red,#e5484d) 40%,var(--line))}
.demo-progress.done{border-color:color-mix(in srgb,var(--green,#22c55e) 35%,var(--line))}
.demo-progress-head{display:flex;align-items:center;gap:8px;font-size:10.5px}
.demo-progress-head b{color:var(--text)}
.demo-progress-head span{color:var(--text-3);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.demo-progress-bar{height:5px;border-radius:99px;background:var(--panel-3);margin:7px 0 4px;overflow:hidden}
.demo-progress-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#fff));transition:width .3s}
.demo-progress-log{font-size:9.5px;color:var(--text-3);display:flex;flex-direction:column;gap:2px;margin-top:4px}
.demo-progress-log i{font-style:normal;color:var(--text-3);opacity:.7;margin-right:6px}
/* 导图画布（mind-elixir / ECharts 双引擎）与版本面板 */
.pm-plot-wrap{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;min-height:460px;height:calc(100vh - 300px);position:relative}
.pm-plot{width:100%;height:100%;min-height:456px;position:relative}
.pm-mind{width:100%;height:100%}
.pm-force-legend{position:absolute;left:10px;top:10px;display:flex;gap:9px;font-size:9.5px;color:var(--text-3);background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:8px;padding:4px 8px;pointer-events:none}
.pm-force-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px;vertical-align:middle}
.pm-force-legend i.ext{background:repeating-linear-gradient(45deg,var(--text-3),var(--text-3) 2px,transparent 2px,transparent 4px)}
.pm-force-hint{position:absolute;right:10px;bottom:8px;font-size:9px;color:var(--text-3);background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:8px;padding:3px 8px;pointer-events:none}
.pm-preview-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));background:var(--accent-soft);border-radius:9px;margin-bottom:7px;font-size:10.5px}
.pm-preview-bar b{color:var(--text)}
.pm-preview-bar span{color:var(--text-3);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-engine-seg{flex-shrink:0}
.pm-versions{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}
.pm-version{border:1px solid transparent;border-radius:7px;padding:5px 7px;cursor:pointer;position:relative}
.pm-version:hover{background:var(--hover)}
.pm-version.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.pm-version b{display:block;font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-version small{display:block;font-size:8.5px;color:var(--text-3);margin-top:1px}
.pm-version .pm-map-ops .icon-btn{opacity:0;transition:opacity .15s}
.pm-version:hover .pm-map-ops .icon-btn{opacity:1}
.pm-map-src{color:var(--text-3);opacity:.85}
.diff-list{margin:4px 0 0;padding-left:16px;font-size:10.5px;color:var(--text-2);max-height:120px;overflow:auto}
@media (max-width:1000px){.product-note-list{grid-template-columns:1fr}.product-demo-layout{grid-template-columns:190px minmax(0,1fr)}.product-ws{max-width:220px}}

/* ---------- test ---------- */
.test-case-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.test-case{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 11px;min-width:0}
.test-case-head{display:flex;align-items:center;gap:6px}
.test-case-head b{font-size:11.5px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.test-case-head i{font-style:normal;font-size:8.5px;color:var(--text-3);border:1px solid var(--line);border-radius:99px;padding:0 5px}
.test-prio{font-size:8.5px;border-radius:4px;padding:1px 4px;background:var(--accent-soft);color:var(--accent-ink);font-weight:700}
.test-prio.p0{background:#fee2e2;color:#b91c1c}.test-prio.p1{background:#ffedd5;color:#c2410c}.test-prio.p3{background:var(--panel-2);color:var(--text-3)}
.test-case-meta{font-size:9.5px;color:var(--text-3);margin:5px 0 3px}
.test-case ol{margin:4px 0 4px 15px;padding:0;font-size:10px;line-height:1.55;color:var(--text-2)}
.test-expected{font-size:10px;color:var(--text-2);background:var(--panel-2);border-radius:6px;padding:5px 7px;margin-top:4px}
.test-run-list{display:flex;flex-direction:column;gap:6px}
.test-run-case{border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:8px 10px}
.test-run-case.pass{border-color:color-mix(in srgb,var(--green) 40%,var(--line))}
.test-run-case.fail{border-color:color-mix(in srgb,var(--red) 40%,var(--line))}
.test-run-case>div:first-child{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.test-run-case b{font-size:11px;color:var(--text)}
.test-run-case small{font-size:9.5px;color:var(--text-3);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.test-run-actions{display:flex;align-items:center;gap:3px;margin-top:6px;flex-wrap:wrap}
.test-run-actions button{height:23px;padding:0 7px;border:1px solid var(--line);background:var(--panel-2);color:var(--text-3);border-radius:5px;font:9.5px var(--font);cursor:pointer}
.test-run-actions button.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink)}
.test-run-actions .btn{height:23px;font-size:9.5px;padding:0 7px}
.test-bug-id{font-style:normal;font-size:8.5px;color:var(--red);border:1px solid color-mix(in srgb,var(--red) 30%,var(--line));border-radius:99px;padding:1px 5px}
.test-note{width:100%;height:26px;margin-top:6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text);padding:0 7px;font:10px var(--font)}
.test-report{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.test-report-hero{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.test-report-hero h2{font-size:22px;margin:2px 0;letter-spacing:-.4px}
.test-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:14px 0}
.test-kpis>div{background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.test-kpis b{display:block;font-size:19px}.test-kpis span{font-size:9px;color:var(--text-3)}
.test-kpis .ok b{color:var(--green)}.test-kpis .bad b{color:var(--red)}.test-kpis .warn b{color:var(--orange)}
.test-report-grid{display:grid;grid-template-columns:180px 1fr;gap:10px;align-items:stretch}
.test-ring{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:170px;position:relative;overflow:hidden}
.test-ring::before{content:'';position:absolute;width:120px;height:120px;border-radius:50%;background:conic-gradient(var(--green) 0 var(--rate),var(--red) var(--rate) 100%);filter:drop-shadow(0 0 14px color-mix(in srgb,var(--green) 30%,transparent));animation:testPulse 2s ease-in-out infinite}
.test-ring::after{content:'';position:absolute;width:88px;height:88px;border-radius:50%;background:var(--panel-2)}
.test-ring b,.test-ring span{position:relative;z-index:1}.test-ring b{font-size:25px}.test-ring span{font-size:9px;color:var(--text-3)}
.test-bars{display:flex;align-items:flex-end;gap:5px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-height:170px;perspective:600px}
.test-bars i{flex:1;min-width:8px;border-radius:4px 4px 0 0;height:var(--h);transform-origin:bottom;animation:testGrow .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d);background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 45%,#000))}
.test-bars i.pass{background:linear-gradient(180deg,var(--green),color-mix(in srgb,var(--green) 40%,#000))}.test-bars i.fail{background:linear-gradient(180deg,var(--red),color-mix(in srgb,var(--red) 40%,#000))}.test-bars i.pending{background:linear-gradient(180deg,var(--text-3),var(--panel))}
@keyframes testGrow{from{transform:scaleY(0) rotateX(32deg);opacity:.2}to{transform:scaleY(1) rotateX(0);opacity:1}}
@keyframes testPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
.test-report-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:10px}
.test-report-card{display:flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:9.5px;background:var(--panel-2)}
.test-report-card b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
.test-report-card i{font-style:normal;font-size:8.5px;color:var(--text-3)}
.test-report-card.pass{border-color:color-mix(in srgb,var(--green) 35%,var(--line))}.test-report-card.fail{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.test-timeline{display:flex;align-items:center;gap:5px;margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:9px;color:var(--text-3)}
.test-timeline i{flex:1;height:1px;background:linear-gradient(90deg,var(--line),var(--accent),var(--line))}
.test-deploy{max-width:720px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.test-deploy-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.test-deploy .mfield{margin-bottom:9px}
.test-deploy-log{white-space:pre-wrap;max-height:240px;overflow:auto;background:#0b0f16;color:#9fe3b0;border:1px solid var(--line);border-radius:8px;padding:10px;font:10px/1.6 var(--mono,monospace);margin-top:10px}
@media(max-width:1000px){.test-case-list,.test-report-cards{grid-template-columns:1fr}.test-report-grid{grid-template-columns:140px 1fr}.test-kpis{grid-template-columns:repeat(3,1fr)}}

.module-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.module-card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 10px;min-width:0;cursor:pointer}
.module-card>div{display:flex;align-items:center;gap:5px}
.module-card b{font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.module-kind{font-size:8.5px;color:var(--accent-ink);background:var(--accent-soft);border-radius:4px;padding:1px 4px}
.platform{font-style:normal;font-size:8px;border:1px solid var(--line);border-radius:99px;padding:1px 5px;color:var(--text-3)}
.platform.mobile{border-color:var(--green);color:var(--green)}.platform.tablet{border-color:var(--orange);color:var(--orange)}.platform.pc{border-color:var(--accent);color:var(--accent)}
.module-card p{font-size:10px;line-height:1.5;color:var(--text-2);margin:5px 0 3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.module-card small{font-size:9px;color:var(--text-3)}
@media(max-width:1000px){.module-grid{grid-template-columns:1fr 1fr}}

.test-live-stage{display:grid;grid-template-columns:120px 1fr 150px;gap:10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px;position:relative;overflow:hidden}
.test-live-ring{width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--green) 0 var(--rate),var(--red) var(--rate) 100%);display:grid;place-items:center;position:relative;margin:auto;animation:testPulse 2.2s ease-in-out infinite}
.test-live-ring::after{content:'';position:absolute;inset:9px;border-radius:50%;background:var(--panel)}
.test-live-ring b,.test-live-ring span{position:relative;z-index:1}.test-live-ring b{font-size:18px}.test-live-ring span{font-size:7.5px;color:var(--text-3);display:block;text-align:center}
.test-live-bars{height:86px;display:flex;align-items:flex-end;gap:4px;perspective:500px;position:relative;padding:0 4px}
.test-live-bars i{flex:1;min-width:5px;height:var(--h);border-radius:3px 3px 0 0;transform-origin:bottom;animation:testGrow .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d);background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 35%,#000))}
.test-live-bars i.pass{background:linear-gradient(180deg,var(--green),color-mix(in srgb,var(--green) 35%,#000))}.test-live-bars i.fail{background:linear-gradient(180deg,var(--red),color-mix(in srgb,var(--red) 35%,#000))}.test-live-bars i.blocked{background:linear-gradient(180deg,var(--orange),color-mix(in srgb,var(--orange) 35%,#000))}
.test-live-scan{position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 22%,transparent),transparent);transform:translateX(-100%);animation:testScan 3.2s linear infinite;pointer-events:none}
@keyframes testScan{to{transform:translateX(100%)}}
.test-live-legend{display:flex;flex-direction:column;gap:3px;font-size:9px;color:var(--text-3)}
.test-live-legend span{white-space:nowrap}
@media(max-width:900px){.test-live-stage{grid-template-columns:90px 1fr}.test-live-legend{display:none}}
@media(prefers-reduced-motion:reduce){.test-live-bars i,.test-live-ring,.test-live-scan{animation:none}}

/* ---------- 2026 UI refresh: command palette + Plane/Linear-inspired surfaces ---------- */
.modal:has(.cmd-palette){width:568px;padding:8px;border-radius:16px}
.cmd-palette{display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 80px))}
.cmd-search{display:flex;align-items:center;gap:9px;height:44px;padding:0 10px;border-bottom:1px solid var(--line);color:var(--text-3)}
.cmd-search input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font:13px var(--font)}
.cmd-list{overflow:auto;padding:6px 2px}
.cmd-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;text-align:left;padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--text)}
.cmd-row:hover,.cmd-row:focus-visible{background:var(--accent-soft);color:var(--accent-ink);outline:0}
.cmd-ico{width:26px;height:26px;border-radius:7px;background:var(--panel-2);border:1px solid var(--line);display:grid;place-items:center;color:var(--text-2);flex:0 0 auto}
.cmd-row b{display:block;font-size:12.5px;font-weight:600}.cmd-row small{display:block;font-size:10px;color:var(--text-3);margin-top:1px}
.cmd-foot{padding:8px 10px;border-top:1px solid var(--line);font-size:10px;color:var(--text-3)}
.head-pills{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
.head-pills span{height:22px;display:inline-flex;align-items:center;gap:4px;padding:0 8px;border-radius:999px;border:1px solid var(--line);background:var(--panel);font-size:10px;color:var(--text-2)}
.head-pills b{color:var(--text);font-weight:650}
.module-coverage{display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px 10px;background:var(--panel);border:1px solid var(--line);border-radius:9px;font-size:10px;color:var(--text-3);flex-wrap:wrap}
.module-coverage .bar{height:5px;flex:1;min-width:100px;border-radius:99px;background:var(--panel-3);overflow:hidden;display:flex}
.module-coverage .bar i{height:100%;display:block}
.module-coverage b{color:var(--text)}
.module-card{position:relative;overflow:hidden}
.module-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--line-strong)}
.module-card.module::before{background:var(--accent)}.module-card.business::before{background:var(--green)}.module-card.feature::before{background:var(--amber)}.module-card.requirement::before{background:var(--orange)}
.module-card:hover{border-color:var(--line-strong);box-shadow:0 3px 12px rgba(16,16,28,.06);transform:translateY(-1px)}
.module-card{transition:border-color .15s,box-shadow .15s,transform .15s}
.view-head{position:relative}
.view-head::after{content:'';position:absolute;left:0;right:0;bottom:-7px;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.bug-card{transition:border-color .14s,box-shadow .14s,transform .14s}
.bug-card:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(16,16,28,.07)}
.test-case{transition:border-color .14s,box-shadow .14s,transform .14s}
.test-case:hover{transform:translateY(-1px);border-color:var(--line-strong);box-shadow:0 4px 14px rgba(16,16,28,.06)}
@media(max-width:700px){.modal:has(.cmd-palette){width:calc(100vw - 24px)}}

/* ---------- 门户（项目 / 产品 + 功能入口） ---------- */
.wb-project-select{height:27px;max-width:190px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);font:11.5px var(--font);padding:0 6px;outline:0;cursor:pointer}
.wb-project-select:hover{border-color:var(--line-strong)}
.head-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.side-home{padding:0 1px 7px;margin-bottom:8px;border-bottom:1px solid var(--line)}
.portal-head{gap:18px}
.portal-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.portal-scope{font-size:11px;color:var(--text-3)}
.portal-scope b{color:var(--text);font-weight:650}
.portal-sec-head{display:flex;align-items:center;gap:8px;margin:16px 0 8px}
.portal-sec-actions{display:flex;align-items:center;gap:6px;margin-left:auto;font-size:10.5px;color:var(--text-3)}
.portal-sec-head h2{margin:0;font-size:12.5px;font-weight:650}
.portal-sec-head span{font-size:10.5px;color:var(--text-3)}
.portal-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:12px}
.portal-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;flex-direction:column;gap:8px;cursor:pointer;min-height:136px;transition:border-color .14s,box-shadow .14s,transform .14s}
.portal-card:hover{border-color:var(--line-strong);box-shadow:0 4px 14px rgba(16,16,28,.07);transform:translateY(-1px)}
.portal-card.active{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 0 0 2px var(--accent-soft)}
.portal-card-h{display:flex;align-items:center;gap:8px}
.portal-ico{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--panel-3);color:var(--text-2);flex:0 0 auto}
.portal-ico.accent{background:var(--accent-soft);color:var(--accent-ink)}
.portal-card-t{display:flex;flex-direction:column;min-width:0;line-height:1.35}
.portal-card-t b{font-size:13.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.portal-card-t small{font-size:10px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.portal-check{margin-left:auto;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;flex:0 0 auto}
.portal-path{font-size:9.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.portal-metrics{display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--text-3)}
.portal-metrics b{color:var(--text);font-weight:650;font-size:12.5px;font-variant-numeric:tabular-nums}
.portal-card-tags{display:flex;gap:5px;flex-wrap:wrap}
.portal-card-tags span{height:19px;padding:0 7px;border-radius:999px;background:var(--panel-3);color:var(--text-3);font-size:9.5px;display:inline-flex;align-items:center}
.portal-card-tags span.green{background:color-mix(in srgb,#0f9f6e 12%,var(--panel));color:#0f9f6e}
.portal-card-tags span.cyan{background:color-mix(in srgb,#0891b2 12%,var(--panel));color:#0891b2}
.portal-feature-go{margin-left:auto;color:var(--text-3);display:grid;place-items:center;transition:color .14s,transform .14s}
.portal-feature:hover .portal-feature-go{color:var(--tile,#5b5bd6);transform:translateX(2px)}
.portal-card-foot{display:flex;align-items:center;gap:5px;margin-top:auto;justify-content:flex-end;flex-wrap:nowrap}
.portal-card-foot .btn,.portal-card-foot .icon-btn{white-space:nowrap;flex:0 0 auto}
.portal-card-foot .btn{height:26px;padding:0 9px;font-size:11px}
.portal-card-foot .btn-hint{margin-right:auto}
.portal-hint{margin-right:auto;font-size:9.5px;color:var(--text-3)}
.btn.tiny{height:23px;padding:0 8px;font-size:10.5px;border-radius:6px;gap:4px}
.btn.tiny.solid{min-width:0}
.portal-enter{border-color:color-mix(in srgb,var(--accent) 40%,var(--line));color:var(--accent-ink);font-weight:600}
.portal-enter:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink)}
/* 门户功能区：按业务分组，每组整行铺满，组内卡片随容器宽度自适应 */
.portal-group{width:100%;min-width:0;border:1px solid var(--line);border-radius:14px;background:var(--panel-2);padding:12px 12px 13px}
.portal-group + .portal-group{margin-top:12px}
.portal-group-head{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;min-width:0}
.portal-teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.team-card{display:flex;flex-direction:column;gap:8px;padding:13px 14px;min-height:132px;border:1px solid var(--line);border-radius:12px;background:var(--panel);cursor:pointer;text-align:left}
.team-card:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--line));box-shadow:0 8px 22px rgba(16,16,28,.06)}
.team-card.default{border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.team-card.add{align-items:center;justify-content:center;border-style:dashed;color:var(--text-3);font-size:12px;min-height:130px}
.team-card.add:hover{color:var(--accent)}
.team-card-h{display:flex;align-items:center;gap:9px}
.team-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-ink);flex:none}
.team-card-t{display:flex;flex-direction:column;min-width:0}
.team-card-t b{font-size:13px}
.team-card-t small{color:var(--text-3);font-size:10.5px}
.team-go{margin-left:auto;color:var(--text-3)}
.team-desc{font-size:11px;color:var(--text-3);line-height:1.6;min-height:30px}
.team-members{display:flex;flex-wrap:wrap;gap:4px}
.team-chip{font-size:10.5px;padding:2px 7px;border-radius:6px;background:var(--panel-2);color:var(--text-2);border:1px solid var(--line)}
.team-chip.ghost{color:var(--text-3)}
.team-chip.lead{background:color-mix(in srgb,#d97706 14%,transparent);border-color:color-mix(in srgb,#d97706 26%,var(--line));color:#b45309;font-weight:600}
/* 团队/成员弹窗自包含：不依赖灵感视图的 .idea-modal 样式 */
.agent-modal{width:660px;max-width:100%;background:transparent;border:0;box-shadow:none;padding:0}
.agent-modal h3{margin:0 0 10px;font-size:14px}
.agent-modal .m-field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.agent-modal .m-field label{font-size:10.5px;color:var(--text-3)}
.agent-modal .m-field input,.agent-modal .m-field select,.agent-modal .m-field textarea{height:28px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text);font:inherit;font-size:11.5px;padding:0 7px;outline:0}
.agent-modal .m-field textarea{height:auto;min-height:58px;padding:6px 7px;resize:vertical}
.agent-modal .m-field input:focus,.agent-modal .m-field select:focus,.agent-modal .m-field textarea:focus{border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}
.agent-foot{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.agent-foot .note{font-size:10.5px;color:var(--text-3)}
.agent-foot .right{display:flex;gap:6px;margin-left:auto}
.agent-team-meta{font-size:11px;color:var(--text-3);margin:-6px 0 10px}
.agent-list{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto;margin-bottom:10px}
.agent-row{display:flex;gap:8px;align-items:flex-start;padding:8px 9px;border:1px solid var(--line);border-radius:9px;background:var(--panel-2)}
.agent-row-main{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.agent-row-main small{color:var(--text-3);font-size:10px}
.agent-role{font-size:9.5px;padding:1px 6px;border-radius:99px;background:var(--accent-soft);color:var(--accent-ink)}
.agent-role.lead{background:color-mix(in srgb,#d97706 18%,transparent);color:#b45309}
.agent-intro{flex-basis:100%;font-size:10.5px;color:var(--text-3);line-height:1.5}
.agent-row-acts{display:flex;gap:4px;flex:none}
.agent-add-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.agent-add-row select{height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px;max-width:220px}
.agent-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.agent-empty{padding:16px;text-align:center;color:var(--text-3);font-size:11px;border:1px dashed var(--line);border-radius:9px}
.agent-multi{display:flex;flex-wrap:wrap;gap:4px;max-height:104px;overflow:auto;padding:4px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)}
.agent-multi-item{font-size:10.5px;padding:3px 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text-2);cursor:pointer;line-height:1.4}
.agent-multi-item:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.agent-multi-item.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 45%,var(--line));color:var(--accent-ink);font-weight:600}
.agent-bind{margin:2px 0 10px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel-2)}
.agent-bind-head{font-size:11px;font-weight:650;color:var(--text);margin-bottom:7px;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.agent-bind-head small{font-weight:400;color:var(--text-3);font-size:10px}
.agent-bind-row{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-top:1px dashed var(--line)}
.agent-bind-row:first-of-type{border-top:0}
.agent-bind-label{flex:0 0 130px;font-size:10.5px;color:var(--text-2);padding-top:3px}
.agent-bind-label small{color:var(--text-3);font-size:9.5px}
.agent-bind-chips{display:flex;flex-wrap:wrap;gap:4px;flex:1;min-width:0}
.agent-bind-chip{font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text-3);cursor:pointer}
.agent-bind-chip.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 45%,var(--line));color:var(--accent-ink);font-weight:600}
.portal-group-head h3{margin:0;font-size:12.5px;font-weight:650;display:flex;align-items:center;gap:7px;flex:0 0 auto}
.portal-group-dot{width:7px;height:7px;border-radius:2px;background:var(--accent);flex:0 0 auto}
.portal-group[data-group="rd"] .portal-group-dot{background:#0891b2}
.portal-group-meta{font-size:10.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.portal-features{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:11px;min-width:0}
.portal-feature{display:flex;align-items:center;gap:12px;padding:14px 15px;min-height:88px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:13px;cursor:pointer;text-align:left;transition:border-color .14s,box-shadow .14s,transform .14s}
.portal-feature:hover{border-color:color-mix(in srgb,var(--tile,#5b5bd6) 42%,var(--line));box-shadow:0 8px 22px rgba(16,16,28,.09);transform:translateY(-2px)}
.portal-feature-ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--tile,#5b5bd6) 13%,var(--panel));color:var(--tile,#5b5bd6);flex:0 0 auto}
.portal-feature-main{display:flex;flex-direction:column;min-width:0;line-height:1.35}
.portal-feature-main b{font-size:13.5px;font-weight:650}
.portal-feature-main small{font-size:10.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.portal-feature-n{margin-left:auto;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--tile,#5b5bd6) 12%,var(--panel-3));color:var(--tile,#5b5bd6);font-size:11px;font-weight:650;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.portal-empty{display:flex;align-items:center;gap:10px;margin-top:10px;padding:12px;border:1px dashed var(--line-strong);border-radius:11px;color:var(--text-2);background:var(--panel-2)}
.portal-empty b{display:block;font-size:12px}
.portal-empty span{display:block;font-size:10.5px;color:var(--text-3)}
.portal-empty .btn{margin-left:auto}

`;
		// src/client/idea.css.ts
		/** 灵感视图样式（注入 shadow root，类名统一 idea-* 前缀，避免与工作台既有样式冲突）。 */
		const IDEA_CSS = String.raw`
.idea-root{display:grid;grid-template-columns:236px minmax(0,1fr) 302px;height:100%;min-height:0;background:var(--bg)}
.idea-root.idea-no-detail{grid-template-columns:236px minmax(0,1fr)}
.idea-list{background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.idea-list-head{padding:10px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--line)}
.idea-list-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:650}
.idea-list-title .n{font-weight:400;color:var(--text-3);font-size:10.5px}
.idea-search{height:28px;border:1px solid var(--line);background:var(--panel-2);border-radius:7px;display:flex;align-items:center;gap:6px;padding:0 8px;color:var(--text-3);font-size:11.5px}
.idea-search input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font:inherit;min-width:0}
.idea-filter{display:flex;gap:4px;flex-wrap:wrap}
.idea-filter button{height:22px;padding:0 8px;border:0;background:transparent;border-radius:999px;color:var(--text-3);font-size:10.5px;cursor:pointer}
.idea-filter button.on{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
.idea-project{display:flex;align-items:center;gap:4px}
.idea-project select{flex:1;min-width:0;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px;outline:0}
.idea-project .icon-btn{width:26px;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font-size:12px;cursor:pointer;display:grid;place-items:center}
.idea-project .icon-btn:hover{background:var(--hover);color:var(--text)}
.idea-items{flex:1;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px}
.idea-item{padding:8px 9px;border-radius:9px;border:1px solid transparent;cursor:pointer}
.idea-item:hover{background:var(--hover)}
.idea-item.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 22%,transparent)}
.idea-item-t{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;min-width:0}
.idea-item-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.idea-item-t i{width:6px;height:6px;border-radius:50%;flex:none;background:var(--text-3)}
.idea-item-t i.ready{background:var(--accent)}
.idea-item-t i.generating{background:var(--amber)}
.idea-item-t i.failed{background:var(--red)}
.idea-item-m{margin-top:3px;font-size:10.5px;color:var(--text-3);display:flex;gap:8px}
.idea-item-m b{color:var(--text-2);font-weight:600}
.idea-list-foot{padding:8px 10px;border-top:1px solid var(--line);display:flex;align-items:center;gap:6px;color:var(--text-3);font-size:10.5px}
.idea-empty{padding:18px 14px;color:var(--text-3);font-size:11.5px;line-height:1.7}
.idea-empty b{display:block;color:var(--text-2);font-size:12.5px;margin-bottom:4px}

.idea-canvas{display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;background:var(--panel)}
.idea-root{position:relative}
.idea-team{height:26px;max-width:190px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px;outline:0}
.idea-chat{position:absolute;right:12px;top:52px;bottom:12px;width:360px;min-width:300px;max-width:560px;z-index:20;display:flex;flex-direction:column;overflow:hidden;
  background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 46px rgba(16,16,28,.18)}
/* 左缘拖拽手柄：CSS resize 的右下角手柄在这里实际拖不到 */
.idea-chat-resizer{position:absolute;left:0;top:32px;bottom:12px;width:8px;cursor:col-resize;z-index:3;border-radius:12px 0 0 12px}
.idea-chat-resizer::after{content:'';position:absolute;left:3px;top:50%;transform:translateY(-50%);width:2px;height:44px;border-radius:2px;background:var(--line)}
.idea-chat-resizer:hover::after{background:var(--accent)}
.idea-chat-empty{padding:24px 14px;color:var(--text-3);font-size:11.5px;line-height:1.7;text-align:center}
.chat-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line);font-size:11.5px;color:var(--text-2)}
.chat-head b{color:var(--text);font-weight:650}
.chat-dot{width:7px;height:7px;border-radius:50%;background:var(--text-3)}
.chat-status{font-size:10px;padding:1px 6px;border-radius:99px;background:var(--panel-2);color:var(--text-3)}
.chat-status.running,.chat-status.dispatching{background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8}
.chat-status.done{background:color-mix(in srgb,#0f9f6e 14%,transparent);color:#0b7a54}
.chat-status.failed,.chat-status.timeout,.chat-status.cancelled{background:color-mix(in srgb,#d83b3b 12%,transparent);color:#b42323}
.chat-count{font-size:10px;color:var(--text-3)}
.chat-list{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:14px;background:var(--panel)}
/* 每条消息占满可用宽度（自适应抽屉宽度），靠缩进与底色区分发言方 */
.chat-turn{display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%}
.chat-meta{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--text-3)}
.chat-meta b{color:var(--text-2);font-weight:650;font-size:11px}
.chat-body{font-size:12.5px;line-height:1.72;color:var(--text);word-break:break-word;min-width:0}
.chat-body p{margin:0 0 8px}
.chat-body p:last-child{margin-bottom:0}
.chat-body ul,.chat-body ol{margin:0 0 8px;padding-left:18px}
.chat-body li{margin:2px 0}
.chat-body b.chat-h{display:block;margin:10px 0 4px;color:var(--text);font-size:12.5px}
.chat-body .chat-li{margin-left:0}
.chat-body pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;overflow:auto;font-size:11px;line-height:1.6;margin:6px 0}
.chat-body code{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:11px}
.chat-body pre code{border:0;background:none;padding:0}
.chat-body hr.chat-hr{border:0;border-top:1px solid var(--line);margin:10px 0}
.chat-body blockquote.chat-quote{margin:6px 0;padding:6px 10px;border-left:3px solid var(--line);color:var(--text-2);background:var(--panel-2);border-radius:0 6px 6px 0}
/* 用户：右侧浅色气泡 */
.chat-turn.user{align-items:flex-end}
.chat-turn.user .chat-meta{justify-content:flex-end}
.chat-user-body{background:var(--accent-soft);color:var(--accent-ink);border-radius:10px 10px 2px 10px;padding:8px 11px;max-width:88%}
/* 助手：左对齐正文，无气泡（对齐 DSH 全宽叙述） */
.chat-turn.assistant{padding-left:2px}
/* 思考：可折叠一行 + 次级字号 */
.chat-reasoning{border-left:2px solid var(--line);padding-left:10px;min-width:0}
.chat-reasoning>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:11.5px;color:var(--text-3)}
.chat-reasoning>summary::-webkit-details-marker{display:none}
.chat-reasoning>summary::before{content:'▸';font-size:10px;color:var(--text-3)}
.chat-reasoning[open]>summary::before{content:'▾'}
.chat-reason-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.chat-reason-body{margin-top:6px;font-size:11.5px;line-height:1.7;color:var(--text-2)}
/* 工具：卡片，带状态色 */
.chat-tool{display:flex;flex-direction:column;gap:5px;border:1px solid var(--line);border-radius:9px;background:var(--panel-2);padding:8px 10px;min-width:0}
.chat-tool.result.ok{border-left:3px solid #0f9f6e}
.chat-tool.result.err{border-left:3px solid #d83b3b}
.chat-tool-head{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-2);min-width:0}
.chat-tool-head b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-time{margin-left:auto;font-size:10px;color:var(--text-3);flex:none}
.chat-tool-body{margin:0;background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}
/* 类型标签 */
.chat-tag{flex:none;font-size:10px;line-height:1;padding:3px 6px;border-radius:5px;background:var(--panel);border:1px solid var(--line);color:var(--text-3)}
.chat-tag.think{background:color-mix(in srgb,#7c3aed 12%,transparent);border-color:transparent;color:#7c3aed}
.chat-tag.tool{background:color-mix(in srgb,#2563eb 12%,transparent);border-color:transparent;color:#1d4ed8}
.chat-tag.ok{background:color-mix(in srgb,#0f9f6e 14%,transparent);border-color:transparent;color:#0b7a54}
.chat-tag.err{background:color-mix(in srgb,#d83b3b 12%,transparent);border-color:transparent;color:#b42323}
.chat-tag.sys{background:var(--panel-2);color:var(--text-3)}
/* 系统：居中细线 */
.chat-turn.system{flex-direction:row;align-items:center;justify-content:center;gap:6px;font-size:10.5px;color:var(--text-3)}
.chat-compose{display:flex;gap:6px;align-items:flex-end;padding:8px;border-top:1px solid var(--line)}
.chat-compose textarea{flex:1;min-width:0;min-height:40px;max-height:120px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);font:inherit;font-size:11.5px;padding:6px 8px;outline:0;resize:vertical}
.chat-compose textarea:focus{border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}

.idea-bar{height:44px;flex:0 0 44px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--panel-2)}
.idea-bar .grow{flex:1}
.idea-seg{display:inline-flex;background:var(--panel-3);border-radius:8px;padding:2px;gap:2px}
.idea-seg button{height:24px;padding:0 10px;border:0;background:transparent;border-radius:6px;color:var(--text-2);font-size:11.5px;cursor:pointer}
.idea-seg button.on{background:var(--panel);color:var(--text);font-weight:600;box-shadow:0 1px 2px rgba(16,16,28,.08)}
.idea-sub{height:30px;flex:0 0 30px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);color:var(--text-3);font-size:10.5px}
.idea-sub b{color:var(--text-2);font-weight:600}
.idea-sub .right{margin-left:auto}
.idea-progress{height:36px;flex:0 0 36px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 7%,var(--panel)),var(--panel));font-size:10.5px;color:var(--text-2)}
.idea-progress .bar{width:160px;height:4px;border-radius:999px;background:var(--panel-3);overflow:hidden}
.idea-progress .bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#7a76ff,var(--accent))}
.idea-plot{flex:1;position:relative;min-height:0;min-width:0;overflow:hidden;background:var(--panel)}
/* mind-elixir 的容器必须有确定尺寸，否则首帧会按 0 宽排版 */
.idea-plot .idea-mind{position:absolute;inset:0;width:100%;height:100%}
.idea-plot.readonly{overflow:auto;background:var(--panel-2)}
.idea-plot .map-container{width:100%;height:100%}
.idea-plot .idea-svg{display:block;margin:0 auto}
.idea-hint{position:absolute;left:12px;bottom:10px;font-size:10.5px;color:var(--text-3);background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:8px;padding:4px 9px;pointer-events:none}
.idea-zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px;box-shadow:var(--shadow)}
.idea-zoom button{width:26px;height:24px;border:0;background:transparent;color:var(--text-2);font-size:13px;border-radius:6px;cursor:pointer}
.idea-zoom button:hover{background:var(--hover)}
.idea-legend{position:absolute;left:12px;top:10px;display:flex;flex-wrap:wrap;gap:6px;max-width:70%}
.idea-legend span{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text-2);background:color-mix(in srgb,var(--panel) 86%,transparent);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
.idea-legend i{width:7px;height:7px;border-radius:50%;display:block}
.idea-preview-banner{height:32px;flex:0 0 32px;display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--amber-soft);color:var(--amber);font-size:11px;border-bottom:1px solid var(--line)}

.idea-detail{border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0;overflow:auto}
.idea-d-head{padding:12px 14px 10px;border-bottom:1px solid var(--line)}
.idea-eyebrow{font-size:10px;letter-spacing:.08em;color:var(--text-3);text-transform:uppercase}
.idea-d-title{font-size:14.5px;font-weight:650;margin-top:3px;display:flex;align-items:center;gap:7px}
.idea-d-sub{font-size:11px;color:var(--text-3);margin-top:4px}
.idea-d-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.idea-sec{border:1px solid var(--line);border-radius:10px;background:var(--panel-2);padding:10px 11px}
.idea-sec h4{margin:0 0 7px;font-size:11px;color:var(--text-3);font-weight:600;display:flex;align-items:center;gap:6px}
.idea-sec h4 .right{margin-left:auto;font-weight:400;font-size:10px}
.idea-quote{font-size:11.5px;line-height:1.65;color:var(--text-2);border-left:2px solid var(--accent-soft);padding-left:8px;white-space:pre-wrap;word-break:break-word}
.idea-kv{display:grid;grid-template-columns:64px 1fr;gap:5px 8px;font-size:11.5px;margin:0}
.idea-kv dt{color:var(--text-3)}
.idea-kv dd{margin:0;color:var(--text-2);word-break:break-all}
.idea-actions{display:flex;gap:6px;flex-wrap:wrap}
.idea-quick{display:flex;gap:6px;margin-top:8px;align-items:flex-end}
.idea-quick textarea{flex:1;min-width:0;min-height:46px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);font:inherit;font-size:11.5px;line-height:1.5;padding:6px 8px;outline:0;resize:vertical}
.idea-quick textarea:focus{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 0 0 3px var(--accent-soft)}
.idea-chip{height:22px;padding:0 8px;border-radius:999px;background:var(--panel-3);color:var(--text-2);font-size:10.5px;display:inline-flex;align-items:center;gap:4px}
.idea-chip.ok{background:var(--green-soft);color:var(--green)}
.idea-chip.warn{background:var(--amber-soft);color:var(--amber)}
.idea-chip.acc{background:var(--accent-soft);color:var(--accent-ink)}
.idea-vers{display:flex;flex-direction:column;gap:2px}
.idea-ver{display:flex;align-items:center;gap:8px;padding:6px 7px;border-radius:7px;font-size:11px;cursor:pointer}
.idea-ver:hover{background:var(--hover)}
.idea-ver.on{background:var(--accent-soft)}
.idea-ver .tag{font-size:9.5px;padding:0 5px;height:16px;border-radius:4px;display:inline-flex;align-items:center;background:var(--panel-3);color:var(--text-3)}
.idea-ver .tag.ai{background:var(--accent-soft);color:var(--accent-ink)}
.idea-ver .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2)}
.idea-ver .d{color:var(--text-3);font-size:10px}
.idea-run-log{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:var(--text-2);max-height:150px;overflow:auto}
.idea-run-log div{display:flex;gap:7px}
.idea-run-log i{color:var(--text-3);font-style:normal;font-variant-numeric:tabular-nums}

.idea-modal .m-row{display:flex;gap:8px}
.idea-modal .m-col{flex:1;min-width:0}
.idea-modal label{display:block;font-size:11px;color:var(--text-3);margin:0 0 5px}
.idea-modal input[type=text],.idea-modal textarea,.idea-modal input[type=url]{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);color:var(--text);font:inherit;font-size:12px;padding:7px 9px;outline:0}
.idea-modal input[type=text]:focus,.idea-modal textarea:focus,.idea-modal input[type=url]:focus{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 0 0 3px var(--accent-soft)}
.idea-modal textarea{resize:vertical;min-height:74px;line-height:1.6}
.idea-modal .m-field{margin-bottom:12px}
.idea-modal .m-hint{font-size:10.5px;color:var(--text-3);margin-top:5px}
.idea-thumbs{display:flex;gap:8px;flex-wrap:wrap}
.idea-thumb{width:74px;height:56px;border-radius:8px;border:1px solid var(--line);background:var(--panel-3);display:grid;place-items:center;font-size:9.5px;color:var(--text-3);position:relative;overflow:hidden}
.idea-thumb img{width:100%;height:100%;object-fit:cover}
.idea-thumb .x{position:absolute;right:2px;top:2px;width:15px;height:15px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:10px;display:grid;place-items:center;cursor:pointer}
.idea-thumb.add{border-style:dashed;cursor:pointer}
.idea-url-row{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-2);border:1px solid var(--line);border-radius:8px;padding:6px 9px;background:var(--panel-2);margin-bottom:6px}
.idea-url-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idea-url-row .x{margin-left:auto;color:var(--text-3);cursor:pointer}
.idea-angles{display:flex;flex-wrap:wrap;gap:6px}
.idea-angles button{height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--text-2);font-size:11px;cursor:pointer}
.idea-angles button.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,var(--line));color:var(--accent-ink);font-weight:600}
/* 预设维度组 */
.angle-presets{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.angle-presets-label{font-size:10px;color:var(--text-3);letter-spacing:.04em}
.angle-preset{height:24px;padding:0 10px;border-radius:999px;border:1px dashed var(--line);background:transparent;color:var(--text-2);font-size:11px;cursor:pointer}
.angle-preset:hover{border-color:color-mix(in srgb,var(--accent) 35%,var(--line));color:var(--accent-ink)}
.angle-preset.on{border-style:solid;background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,var(--line));color:var(--accent-ink);font-weight:600}
.angle-preset-body{border:1px solid var(--line);border-radius:9px;padding:9px 10px;margin-bottom:9px;background:var(--panel-2)}
.angle-preset-hint{font-size:10px;color:var(--text-3);margin-bottom:7px}
.idea-modal-foot{display:flex;align-items:center;gap:8px;margin-top:4px}
.idea-modal-foot .note{font-size:10.5px;color:var(--text-3)}
.idea-modal-foot .right{margin-left:auto;display:flex;gap:8px}
.idea-menu{position:absolute;z-index:30;min-width:168px;background:var(--panel);border:1px solid var(--line);border-radius:10px;
  box-shadow:0 12px 30px rgba(16,16,28,.18);padding:5px;display:flex;flex-direction:column;gap:1px}
.idea-menu button{border:0;background:transparent;text-align:left;padding:6px 9px;border-radius:6px;font-size:11.5px;color:var(--text-2);cursor:pointer}
.idea-menu button:hover{background:var(--hover);color:var(--text)}
.idea-menu button.danger{color:var(--red)}
.idea-menu button.danger:hover{background:var(--red-soft)}
.idea-menu .sep{height:1px;background:var(--line);margin:3px 4px}
.idea-menu .hint{padding:4px 9px 2px;font-size:9.5px;color:var(--text-3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idea-diff-pick{display:flex;align-items:flex-end;gap:8px;margin:6px 0 10px}
.idea-diff-pick label{flex:1;display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:var(--text-3)}
.idea-diff-pick select{height:28px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11.5px;padding:0 6px}
.idea-diff-sum{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:8px;background:var(--panel-2);font-size:11px;color:var(--text-2)}
.idea-diff-sum .add{color:var(--green);font-weight:700}
.idea-diff-sum .del{color:var(--red);font-weight:700}
.idea-diff-sec h5{margin:0 0 4px}
.idea-diff-sec .empty{color:var(--text-3);font-size:10.5px}
.idea-diff{display:flex;flex-direction:column;gap:10px;font-size:11.5px;color:var(--text-2)}
.idea-diff h5{margin:0;font-size:11px;color:var(--text-3);font-weight:600}
.idea-diff .add{color:var(--green)}
.idea-diff .del{color:var(--red)}
.idea-diff ul{margin:4px 0 0;padding-left:16px}
.idea-diff li{margin:2px 0}
`;
		// src/shared/idea-angles.ts
		const IDEA_ANGLES = [
			{
				id: "users",
				label: "用户与场景",
				hint: "谁 · 在什么时刻 · 什么事"
			},
			{
				id: "pain",
				label: "痛点与机会",
				hint: "现状哪里别扭"
			},
			{
				id: "form",
				label: "方案形态",
				hint: "最小可用形态长什么样"
			},
			{
				id: "tech",
				label: "技术与可行",
				hint: "哪一步最容易做不成"
			},
			{
				id: "biz",
				label: "商业与传播",
				hint: "谁付钱 · 怎么扩散"
			},
			{
				id: "risk",
				label: "风险与反例",
				hint: "什么情况下一定失败"
			}
		];
		IDEA_ANGLES.map((a) => a.id).concat("cross");
		const IDEA_ANGLE_PRESETS = [
			{
				id: "demand",
				label: "需求分析",
				hint: "把模糊诉求拆成可验证的需求",
				angles: [
					{
						label: "用户角色",
						hint: "谁在用 · 决策者与使用者是否分离"
					},
					{
						label: "核心场景",
						hint: "什么时刻必须用它 · 频率多高"
					},
					{
						label: "真实痛点",
						hint: "现在怎么凑合 · 代价是什么"
					},
					{
						label: "需求优先级",
						hint: "必须有 / 有了更好 / 可以没有"
					},
					{
						label: "验收标准",
						hint: "怎样算做成 · 谁来判断"
					},
					{
						label: "替代方案",
						hint: "不做这个功能时用户会怎么办"
					}
				]
			},
			{
				id: "research",
				label: "产品调研",
				hint: "看竞品、看用户、看市场空位",
				angles: [
					{
						label: "竞品格局",
						hint: "头部是谁 · 各自护城河"
					},
					{
						label: "用户访谈",
						hint: "真实原话 · 意外的使用方式"
					},
					{
						label: "市场空位",
						hint: "没人做好的那一段是什么"
					},
					{
						label: "定价模式",
						hint: "谁付钱 · 按什么计费"
					},
					{
						label: "获客渠道",
						hint: "用户实际从哪来"
					},
					{
						label: "失败案例",
						hint: "同类产品怎么死的"
					}
				]
			},
			{
				id: "data",
				label: "数据分析",
				hint: "用什么指标判断做对了",
				angles: [
					{
						label: "核心指标",
						hint: "只看一个数的话看哪个"
					},
					{
						label: "数据来源",
						hint: "埋点 / 日志 / 第三方 · 可信吗"
					},
					{
						label: "漏斗转化",
						hint: "哪一步流失最多"
					},
					{
						label: "分群对比",
						hint: "新老 · 高低活跃差异"
					},
					{
						label: "实验设计",
						hint: "怎么验证改动真的有效"
					},
					{
						label: "异常预警",
						hint: "什么信号说明出事了"
					}
				]
			},
			{
				id: "tech",
				label: "技术选型",
				hint: "技术上怎么落地、代价多大",
				angles: [
					{
						label: "技术方案",
						hint: "候选方案与取舍"
					},
					{
						label: "依赖与集成",
						hint: "要接哪些系统 · 谁维护"
					},
					{
						label: "性能与规模",
						hint: "峰值多少 · 先撑到哪一步"
					},
					{
						label: "数据与安全",
						hint: "敏感数据 · 权限与合规"
					},
					{
						label: "开发成本",
						hint: "人天量级 · 能否复用现成"
					},
					{
						label: "运维与回滚",
						hint: "出问题怎么退 · 谁值班"
					}
				]
			}
		];
		// src/client/agent-chat.ts
		/** 从 Lead 会话的 agentTeam 投影提取成员/任务计数（读不到返回 null）。 */
		function teamStateOf(projection) {
			if (projection === null || typeof projection !== "object") return null;
			const members = Array.isArray(projection.members) ? projection.members.filter((member) => member?.role !== "lead" || member?.phase !== "failed") : [];
			const tasks = Array.isArray(projection.tasks) ? projection.tasks.filter((task) => task?.status !== "deleted") : [];
			return {
				members: members.length,
				tasksDone: tasks.filter((task) => task?.status === "completed").length,
				tasksTotal: tasks.length
			};
		}
		function textOf(message) {
			const blocks = Array.isArray(message?.content) ? message.content : [];
			const parts = [];
			for (const block of blocks) if (typeof block === "string") parts.push(block);
			else if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
			if (parts.length > 0) return parts.join("\n").trim();
			return typeof message?.text === "string" ? message.text.trim() : "";
		}
		/** 只取思考块（模型只输出 reasoning 时也不能整条丢掉）。 */
		function reasoningOf(message) {
			return (Array.isArray(message?.content) ? message.content : []).filter((block) => block?.type === "reasoning" && typeof block.text === "string").map((block) => String(block.text)).join("\n").trim();
		}
		/** turn/end 的 reason 在 v4 日志里是对象（如 {kind:'completed'}），兼容字符串与对象。 */
		function reasonText(reason) {
			if (typeof reason === "string") return reason;
			if (reason !== null && typeof reason === "object") {
				const kind = reason.kind ?? reason.type ?? reason.reason;
				return kind === void 0 ? "" : String(kind);
			}
			return "";
		}
		/** 轻量 Markdown：标题/列表/引用/分割线/行内代码/代码块/粗体；先 esc 再替换，避免注入。 */
		function renderMarkdown(text, esc) {
			const lines = esc(text).split("\n");
			const out = [];
			let inCode = false;
			for (const line of lines) {
				if (line.startsWith("```")) {
					inCode = !inCode;
					out.push(inCode ? "<pre><code>" : "</code></pre>");
					continue;
				}
				if (inCode) {
					out.push(`${line}\n`);
					continue;
				}
				const heading = /^(#{1,4})\s+(.*)$/.exec(line);
				if (heading) {
					out.push(`<b class="chat-h">${heading[2]}</b>`);
					continue;
				}
				if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
					out.push("<hr class=\"chat-hr\">");
					continue;
				}
				const quote = /^&gt;\s?(.*)$/.exec(line);
				if (quote) {
					out.push(`<blockquote class="chat-quote">${quote[1]}</blockquote>`);
					continue;
				}
				const bullet = /^[-*]\s+(.*)$/.exec(line);
				if (bullet) {
					out.push(`<div class="chat-li">• ${bullet[1]}</div>`);
					continue;
				}
				const ordered = /^(\d+)[.)]\s+(.*)$/.exec(line);
				if (ordered) {
					out.push(`<div class="chat-li">${ordered[1]}. ${ordered[2]}</div>`);
					continue;
				}
				out.push(line === "" ? "<div class=\"chat-gap\"></div>" : `<div>${line}</div>`);
			}
			if (inCode) out.push("</code></pre>");
			return out.join("").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
		}
		/** 事件 → 聊天项；未知事件返回 null。 */
		function chatItemOf(event) {
			const type = String(event?.type ?? "");
			const data = event?.data ?? {};
			const at = Number(event?.time ?? Date.now());
			if (type === "user/message") {
				const text = textOf(data?.message ?? data);
				return text === "" ? null : {
					kind: "user",
					who: "你",
					text,
					at
				};
			}
			if (type === "assistant/message") {
				const text = textOf(data?.message);
				if (text !== "") return {
					kind: "assistant",
					who: String(data?.message?.source?.name ?? data?.message?.source?.agentName ?? "主理人"),
					text,
					at
				};
				const think = reasoningOf(data?.message);
				if (think !== "") return {
					kind: "reasoning",
					who: "思考",
					text: think,
					at
				};
				return null;
			}
			if (type === "tool/call") {
				const name = String(data?.name ?? "工具");
				let args = String(data?.arguments ?? "");
				let brief = args;
				try {
					const parsed = JSON.parse(args);
					brief = String(parsed?.command ?? parsed?.description ?? parsed?.path ?? parsed?.query ?? args);
				} catch {}
				return {
					kind: "tool-call",
					who: name,
					text: brief.slice(0, 600),
					at,
					callId: String(data?.callId ?? "")
				};
			}
			if (type === "tool/result") {
				const message = data?.message ?? {};
				const failed = message?.isError === true || Boolean(data?.reason);
				const body = failed ? reasonText(data?.reason) || "执行失败" : textOf(message);
				return {
					kind: "tool-result",
					who: failed ? "工具失败" : "工具完成",
					text: body.slice(0, 1200),
					at,
					failed,
					callId: String(message?.toolCallId ?? message?.source?.callId ?? "")
				};
			}
			if (type === "turn/end") {
				const reason = reasonText(data?.reason);
				if (reason === "aborted") return {
					kind: "system",
					who: "系统",
					text: "本轮被中止",
					at
				};
				if (reason !== "" && reason !== "completed") return {
					kind: "system",
					who: "系统",
					text: `本轮结束：${reason}`,
					at
				};
				return null;
			}
			return null;
		}
		function createAgentChat(host, deps) {
			let items = [];
			let status = "idle";
			let note = "";
			let team = null;
			let open = false;
			host.innerHTML = `<div class="chat-head">
      <span class="chat-dot"></span><b class="chat-title">页内会话</b><span class="chat-status"></span>
      <span class="chat-count"></span><span class="grow"></span>
      <button class="btn tiny" data-chat-act="open">在会话中打开</button>
      <button class="btn tiny" data-chat-act="retry">重试</button>
      <button class="btn tiny" data-chat-act="stop">停止</button>
      <button class="icon-btn" data-chat-act="close" title="收起">×</button>
    </div>
    <div class="chat-list" id="agent-chat-list"></div>
    <div class="chat-compose"><textarea id="agent-chat-input" rows="2" placeholder="追加指令，Enter 发送（Shift+Enter 换行）"></textarea>
      <button class="btn-primary" data-chat-act="send">发送</button></div>`;
			const list = host.querySelector("#agent-chat-list");
			const input = host.querySelector("#agent-chat-input");
			const title = host.querySelector(".chat-title");
			const statusEl = host.querySelector(".chat-status");
			const countEl = host.querySelector(".chat-count");
			function paintStatus() {
				statusEl.textContent = status;
				statusEl.className = `chat-status ${status}`;
				countEl.textContent = team !== null ? `成员 ${team.members} · 任务 ${team.tasksDone}/${team.tasksTotal}` : "";
				host.classList.toggle("is-running", status === "running" || status === "dispatching");
				if (note !== "") statusEl.title = note;
			}
			/** 每条消息按类型渲染：用户气泡 / 助手正文 / 思考折叠 / 工具卡片 / 系统提示。 */
			function itemHtml(item) {
				const time = new Date(item.at).toLocaleTimeString("zh-CN", {
					hour: "2-digit",
					minute: "2-digit"
				});
				if (item.kind === "user") return `<div class="chat-turn user"><div class="chat-meta"><b>你</b><span>${time}</span></div>
        <div class="chat-body chat-user-body">${renderMarkdown(item.text, deps.esc)}</div></div>`;
				if (item.kind === "assistant") return `<div class="chat-turn assistant"><div class="chat-meta"><b>${deps.esc(item.who)}</b><span>${time}</span></div>
        <div class="chat-body">${renderMarkdown(item.text, deps.esc)}</div></div>`;
				if (item.kind === "reasoning") {
					const preview = item.text.replace(/\s+/g, " ").slice(0, 80);
					return `<details class="chat-reasoning"><summary><span class="chat-tag think">思考</span><span class="chat-reason-preview">${deps.esc(preview)}…</span></summary>
        <div class="chat-body chat-reason-body">${renderMarkdown(item.text, deps.esc)}</div></details>`;
				}
				if (item.kind === "tool-call") return `<div class="chat-tool call"><div class="chat-tool-head"><span class="chat-tag tool">调用</span><b>${deps.esc(item.who)}</b><span class="chat-time">${time}</span></div>
        <pre class="chat-tool-body">${deps.esc(item.text)}</pre></div>`;
				if (item.kind === "tool-result") {
					const cls = item.failed === true ? "err" : "ok";
					return `<div class="chat-tool result ${cls}"><div class="chat-tool-head"><span class="chat-tag ${cls}">${item.failed === true ? "失败" : "完成"}</span><b>${deps.esc(item.who)}</b><span class="chat-time">${time}</span></div>
        <pre class="chat-tool-body">${deps.esc(item.text)}</pre></div>`;
				}
				return `<div class="chat-turn system"><span class="chat-tag sys">${deps.esc(item.who)}</span><span>${deps.esc(item.text)}</span></div>`;
			}
			/** 相邻的 call/result 归到一组，视觉上是一个工具块。 */
			function append(item) {
				items.push(item);
				if (items.length > 500) items = items.slice(-500);
				const wrap = document.createElement("div");
				wrap.innerHTML = itemHtml(item);
				list.appendChild(wrap.firstElementChild ?? wrap);
				if (list.scrollTop + list.clientHeight >= list.scrollHeight - 80) list.scrollTop = list.scrollHeight;
				paintEmpty();
			}
			/** 空状态：避免抽屉打开后一片空白，看不出是没输出还是没接上 */
			function paintEmpty() {
				const empty = list.querySelector(".idea-chat-empty");
				if (items.length > 0) {
					if (empty !== null) empty.remove();
					return;
				}
				if (empty !== null) return;
				const div = document.createElement("div");
				div.className = "idea-chat-empty";
				div.textContent = status === "running" || status === "dispatching" ? "已连接会话，等待输出…（团队正在规划，通常十几秒后出现第一条）" : "还没有会话内容。点「生成」后这里会实时显示团队消息。";
				list.appendChild(div);
			}
			host.addEventListener("click", (event) => {
				const target = event.target?.closest("[data-chat-act]");
				if (target === null) return;
				const act = target.getAttribute("data-chat-act");
				if (act === "send") send();
				else if (act === "stop") deps.onStop();
				else if (act === "retry") deps.onRetry();
				else if (act === "open") deps.onOpenSession();
				else if (act === "close") close();
			});
			function send() {
				const text = input.value.trim();
				if (text === "") return;
				input.value = "";
				deps.onSend(text);
			}
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					send();
				}
			});
			function openDrawer(next) {
				open = true;
				host.style.display = "";
				title.textContent = `页内会话 · ${next.teamName}`;
				paintStatus();
				paintEmpty();
			}
			function close() {
				open = false;
				host.style.display = "none";
			}
			/** 事件按 seq 去重：读历史 + 订阅实时可能拿到同一批事件。 */
			const seenSeq = /* @__PURE__ */ new Set();
			return {
				open: openDrawer,
				close,
				isOpen: () => open,
				ingest(event) {
					const seq = Number(event?.seq);
					if (Number.isFinite(seq)) {
						if (seenSeq.has(seq)) return;
						seenSeq.add(seq);
					}
					const item = chatItemOf(event);
					if (item !== null) append(item);
				},
				ingestMany(events) {
					for (const event of events) this.ingest(event);
				},
				setStatus(next, nextNote = "") {
					status = next;
					note = nextNote;
					paintStatus();
					paintEmpty();
				},
				setCounts(nextRunning, nextTotal) {
					paintStatus();
				},
				setTeam(state) {
					team = state;
					paintStatus();
				},
				clear() {
					items = [];
					seenSeq.clear();
					list.innerHTML = "";
					paintEmpty();
				},
				destroy() {
					host.innerHTML = "";
					items = [];
					seenSeq.clear();
				}
			};
		}
		// src/client/idea-model.ts
		const ANGLE_COLORS = {
			users: "#2563eb",
			pain: "#0f9f6e",
			form: "#c27c0e",
			tech: "#7c3aed",
			biz: "#db2777",
			risk: "#0891b2",
			cross: "#8b8b98",
			"": "#5b5bd6"
		};
		const EXTRA_PALETTE = [
			"#2563eb",
			"#0f9f6e",
			"#c27c0e",
			"#7c3aed",
			"#db2777",
			"#0891b2"
		];
		/** 内置角度用固定色；自定义角度按 id 哈希落到同一套调色板，保证稳定且可区分。 */
		function angleColor(angle) {
			if (!angle) return ANGLE_COLORS[""];
			if (ANGLE_COLORS[angle] !== void 0) return ANGLE_COLORS[angle];
			let hash = 0;
			for (const ch of angle) hash = hash * 31 + ch.charCodeAt(0) >>> 0;
			return EXTRA_PALETTE[hash % EXTRA_PALETTE.length];
		}
		function childrenMap(graph) {
			const map = /* @__PURE__ */ new Map();
			const byId = new Map(graph.nodes.map((n) => [n.id, n]));
			for (const edge of graph.edges) {
				if (edge.kind !== "tree") continue;
				const child = byId.get(edge.to);
				if (!child) continue;
				const list = map.get(edge.from) ?? [];
				list.push(child);
				map.set(edge.from, list);
			}
			return map;
		}
		function nodeById(graph, id) {
			if (!id) return void 0;
			return graph.nodes.find((n) => n.id === id);
		}
		function graphStats(graph) {
			return {
				nodes: graph.nodes.length,
				directions: graph.nodes.filter((n) => n.type === "direction").length,
				relate: graph.edges.filter((e) => e.kind === "relate").length
			};
		}
		/** graph → mind-elixir 树（只保留 tree 边；折叠状态映射到 expanded）。 */
		function toMindElixir$1(graph) {
			const children = childrenMap(graph);
			const build = (node, guard) => {
				const kids = (children.get(node.id) ?? []).filter((child) => !guard.has(child.id));
				const next = new Set(guard).add(node.id);
				return {
					id: node.id,
					topic: node.label,
					expanded: node.collapsed !== true,
					children: kids.map((child) => build(child, next))
				};
			};
			const root = nodeById(graph, graph.rootId) ?? graph.nodes[0];
			if (!root) return { nodeData: {
				id: "root",
				topic: "灵感",
				children: []
			} };
			return { nodeData: build(root, /* @__PURE__ */ new Set()) };
		}
		/**
		* mind-elixir 数据 → graph。
		* 只覆盖「结构 + 文案」；detail / angle / status / 坐标等元数据按 id 从旧图继承。
		*/
		function fromMindElixir$1(data, prev) {
			const nodes = [];
			const edges = [];
			const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
			const walk = (raw, parentId, depth, guard) => {
				if (!raw || typeof raw.id !== "string" || guard.has(raw.id)) return;
				guard.add(raw.id);
				const old = prevById.get(raw.id);
				const node = {
					id: raw.id,
					type: old?.type ?? (depth === 0 ? "seed" : depth === 1 ? "direction" : "idea"),
					label: String(raw.topic ?? "").slice(0, 24) || "未命名",
					detail: old?.detail ?? "",
					depth,
					parentId,
					angle: old?.angle,
					status: old?.status ?? "kept",
					tags: old?.tags,
					x: old?.x,
					y: old?.y,
					fx: old?.fx,
					fy: old?.fy,
					collapsed: raw.expanded === false ? true : void 0
				};
				nodes.push(node);
				if (parentId !== null) edges.push({
					from: parentId,
					to: raw.id,
					kind: "tree"
				});
				for (const child of raw.children ?? []) walk(child, raw.id, depth + 1, guard);
			};
			walk(data.nodeData, null, 0, /* @__PURE__ */ new Set());
			const rootId = data.nodeData?.id ?? nodes[0]?.id ?? "root";
			const alive = new Set(nodes.map((n) => n.id));
			for (const edge of prev.edges) if (edge.kind === "relate" && alive.has(edge.from) && alive.has(edge.to)) edges.push({ ...edge });
			return {
				v: 1,
				rootId,
				nodes,
				edges
			};
		}
		/** 力导图 option：分类配色、虚线 relate、可拖拽、悬停邻接高亮。 */
		function buildForceOption(graph, opts = {}) {
			const dark = opts.dark === true;
			const categories = [...new Set(graph.nodes.map((n) => n.angle ?? ""))].map((angle) => ({
				name: angle === "" ? "种子" : angle,
				itemStyle: { color: angleColor(angle) }
			}));
			const catIndex = new Map(categories.map((c, i) => [c.name, i]));
			const data = graph.nodes.map((node) => ({
				id: node.id,
				name: node.label,
				category: catIndex.get(node.angle ?? "") ?? 0,
				symbolSize: node.type === "seed" ? 52 : node.type === "direction" ? 34 : 16,
				label: {
					show: node.type !== "idea" || graph.nodes.length <= 60,
					fontSize: node.type === "seed" ? 12 : node.type === "direction" ? 11 : 10,
					fontWeight: node.type === "seed" ? 700 : node.type === "direction" ? 600 : 400,
					color: dark ? "#ecedf1" : "#1a1a1f",
					position: node.type === "idea" ? "bottom" : "inside"
				},
				itemStyle: node.type === "seed" ? {
					color: dark ? "#8b87ff" : "#5b5bd6",
					borderColor: dark ? "#b3b0ff" : "#4a4ac2",
					borderWidth: 1
				} : node.type === "direction" ? {
					color: angleColor(node.angle),
					opacity: .92,
					borderColor: dark ? "#111113" : "#fff",
					borderWidth: 2
				} : {
					color: dark ? "#19191d" : "#fff",
					borderColor: angleColor(node.angle),
					borderWidth: 1.5
				},
				value: node.detail ?? ""
			}));
			const links = graph.edges.map((edge) => ({
				source: edge.from,
				target: edge.to,
				label: edge.kind === "relate" ? {
					show: Boolean(edge.label),
					formatter: edge.label ?? "",
					fontSize: 9,
					color: dark ? "#a3a3b0" : "#8f8f9c"
				} : { show: false },
				lineStyle: edge.kind === "relate" ? {
					type: "dashed",
					color: dark ? "#4a4a56" : "#b9b9c6",
					width: 1.2,
					curveness: .18
				} : {
					color: dark ? "#33333d" : "#e0e0e8",
					width: 1.4,
					curveness: 0
				}
			}));
			return {
				backgroundColor: dark ? "#19191d" : "#ffffff",
				tooltip: {
					show: true,
					formatter: (params) => {
						if (params?.dataType !== "node") return "";
						const node = graph.nodes.find((n) => n.id === params.data.id);
						return `<b>${escapeHtml$1(node?.label ?? "")}</b>${node?.detail ? `<br>${escapeHtml$1(node.detail)}` : ""}`;
					}
				},
				series: [{
					type: "graph",
					layout: "force",
					roam: true,
					draggable: true,
					focusNodeAdjacency: true,
					emphasis: {
						focus: "adjacency",
						lineStyle: { width: 2.4 }
					},
					force: {
						repulsion: 320,
						edgeLength: [70, 150],
						gravity: .06,
						friction: .2,
						layoutAnimation: true
					},
					categories,
					data,
					links,
					labelLayout: { hideOverlap: true },
					edgeSymbol: ["none", "none"],
					selectedMode: "single"
				}]
			};
		}
		function escapeHtml$1(value) {
			return String(value).replace(/[&<>"']/g, (ch) => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&quot;",
				"'": "&#39;"
			})[ch] ?? ch);
		}
		function graphToMarkdown(graph) {
			const children = childrenMap(graph);
			const root = nodeById(graph, graph.rootId);
			const lines = [];
			const walk = (node, depth, guard) => {
				if (guard.has(node.id)) return;
				guard.add(node.id);
				const bullet = depth === 0 ? `# ${node.label}` : `${"  ".repeat(depth)}- ${node.label}`;
				lines.push(bullet + (node.detail && depth > 0 ? ` —— ${node.detail}` : ""));
				for (const child of children.get(node.id) ?? []) walk(child, depth + 1, guard);
			};
			if (root) walk(root, 0, /* @__PURE__ */ new Set());
			const relates = graph.edges.filter((e) => e.kind === "relate");
			if (relates.length > 0) {
				lines.push("", "## 跨支关联");
				for (const edge of relates) {
					const from = nodeById(graph, edge.from)?.label ?? edge.from;
					const to = nodeById(graph, edge.to)?.label ?? edge.to;
					lines.push(`- ${from} ↔ ${to}${edge.label ? `（${edge.label}）` : ""}`);
				}
			}
			return lines.join("\n");
		}
		/** 右向树布局：根 → 方向 → 点子，供 SVG 导出与只读降级使用。 */
		function layoutGraph(graph) {
			const children = childrenMap(graph);
			const root = nodeById(graph, graph.rootId);
			const nodeW = 168;
			const nodeH = 34;
			const gapY = 12;
			const boxes = /* @__PURE__ */ new Map();
			let cursorY = 20;
			const measure = (node, depth, guard) => {
				if (guard.has(node.id)) return;
				guard.add(node.id);
				const kids = children.get(node.id) ?? [];
				if (kids.length === 0) {
					boxes.set(node.id, {
						x: 20 + depth * 232,
						y: cursorY,
						w: nodeW,
						h: nodeH
					});
					cursorY += 46;
					return;
				}
				const start = cursorY;
				for (const kid of kids) measure(kid, depth + 1, guard);
				const end = cursorY - gapY;
				boxes.set(node.id, {
					x: 20 + depth * 232,
					y: (start + end - nodeH) / 2,
					w: nodeW,
					h: nodeH
				});
			};
			if (root) measure(root, 0, /* @__PURE__ */ new Set());
			const edges = [];
			for (const edge of graph.edges) {
				const a = boxes.get(edge.from);
				const b = boxes.get(edge.to);
				if (!a || !b) continue;
				if (edge.kind === "tree") {
					const x1 = a.x + a.w;
					const y1 = a.y + a.h / 2;
					const x2 = b.x;
					const y2 = b.y + b.h / 2;
					const mid = (x1 + x2) / 2;
					edges.push({
						...edge,
						d: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
					});
				} else {
					const x1 = a.x + a.w / 2;
					const y1 = a.y + a.h / 2;
					const x2 = b.x + b.w / 2;
					const y2 = b.y + b.h / 2;
					const mx = (x1 + x2) / 2;
					const my = Math.max(20, Math.min(y1, y2) - 60);
					edges.push({
						...edge,
						d: `M${x1} ${y1} Q${mx} ${my}, ${x2} ${y2}`
					});
				}
			}
			return {
				width: Math.max(320, ...[...boxes.values()].map((b) => b.x + b.w + 20)),
				height: Math.max(200, cursorY + 20),
				boxes,
				edges
			};
		}
		function graphToSVG(graph, opts = {}) {
			const dark = opts.dark === true;
			const layout = layoutGraph(graph);
			const bg = dark ? "#19191d" : "#ffffff";
			const text = dark ? "#ecedf1" : "#1a1a1f";
			const sub = dark ? "#a3a3b0" : "#656570";
			const nodeFill = dark ? "#222228" : "#ffffff";
			const line = dark ? "#3a3a44" : "#d8d8df";
			const parts = [];
			parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`);
			parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
			for (const edge of layout.edges) if (edge.kind === "relate") parts.push(`<path d="${edge.d}" fill="none" stroke="${dark ? "#4a4a56" : "#b9b9c6"}" stroke-width="1.2" stroke-dasharray="4 4"/>`);
			else parts.push(`<path d="${edge.d}" fill="none" stroke="${line}" stroke-width="1.4"/>`);
			for (const node of graph.nodes) {
				const box = layout.boxes.get(node.id);
				if (!box) continue;
				const color = node.type === "seed" ? dark ? "#8b87ff" : "#5b5bd6" : angleColor(node.angle);
				const fill = node.type === "seed" ? color : nodeFill;
				parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${node.type === "seed" ? 11 : 8}" fill="${fill}" stroke="${color}" stroke-width="${node.type === "idea" ? 1.2 : 1.6}"/>`);
				const label = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
				parts.push(`<text x="${box.x + 10}" y="${box.y + box.h / 2 + 4}" font-family="-apple-system,PingFang SC,sans-serif" font-size="${node.type === "seed" ? 13 : 11}" font-weight="${node.type === "seed" ? 700 : 600}" fill="${node.type === "seed" ? "#fff" : text}">${escapeHtml$1(label)}</text>`);
			}
			parts.push(`<text x="20" y="${layout.height - 12}" font-family="-apple-system,PingFang SC,sans-serif" font-size="10" fill="${sub}">dsh-workbench · 灵感 · ${graph.nodes.length} 节点</text>`);
			parts.push("</svg>");
			return parts.join("");
		}
		/** 导出文件名用：去掉路径分隔与非法字符。 */
		function safeName(value) {
			return (value || "idea").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40);
		}
		// src/client/idea.ts
		/**
		* 灵感视图控制器
		*
		* 设计约束：
		* - 画布用 mind-elixir（编辑）/ ECharts graph（关系）两个引擎，实例必须常驻，
		*   所以本模块自持 DOM，只把「列表 / 工具栏 / 详情」的片段重绘；
		* - 与 app.ts 只通过 deps 交互（不 import app.ts，避免循环依赖）；
		* - 所有请求走 /workbench-api/ideas*（独立端点，不进整份快照）。
		*/
		const EMPTY_GRAPH = {
			v: 1,
			rootId: "root",
			nodes: [{
				id: "root",
				type: "seed",
				label: "新的灵感"
			}],
			edges: []
		};
		function createIdeaView(host, deps) {
			const rootNode = host.getRootNode();
			let built = false;
			let loading = false;
			let booted = false;
			let projects = [];
			let ideas = [];
			let selectedId = "";
			let detail = null;
			let draft = {
				rev: 0,
				graph: EMPTY_GRAPH
			};
			let view = "tree";
			let selectedNode = "";
			let preview = null;
			let run = null;
			let polling = 0;
			let query = "";
			let projectFilter = "";
			let filter = "all";
			let busy = "";
			let form = null;
			let direction = "right";
			let menuNode = "";
			let diffState = null;
			let askResolve = null;
			let askValue = "";
			/** askText 弹窗挂在 #wb-modal（不在 rootNode 内），事件需要临时挂到 shadow root 上。 */
			let askDispose = null;
			let chat = null;
			let dispatchId = "";
			let dispatchSessionId = "";
			let dispatchTimer = 0;
			/**
			* 派发现场持久化：dispatchId/sessionId 只存在内存里，页面刷新后抽屉与团队进度会全部丢失
			* （后端会话仍在跑，用户只能去侧栏里翻）。用 localStorage 记一份，重新进入该灵感时恢复。
			* 只存标识，不存消息——消息由 /agents/sessions/:id/events 回放。
			*/
			const DISPATCH_KEY = "dsh-workbench.idea.dispatch";
			function readDispatchMemo() {
				try {
					const raw = window.localStorage.getItem(DISPATCH_KEY);
					if (raw === null || raw === "") return null;
					const parsed = JSON.parse(raw);
					if (typeof parsed.ideaId !== "string" || typeof parsed.dispatchId !== "string" || typeof parsed.sessionId !== "string") return null;
					if (typeof parsed.at === "number" && Date.now() - parsed.at > 72e5) {
						window.localStorage.removeItem(DISPATCH_KEY);
						return null;
					}
					return {
						ideaId: parsed.ideaId,
						dispatchId: parsed.dispatchId,
						sessionId: parsed.sessionId,
						teamName: String(parsed.teamName ?? ""),
						at: Number(parsed.at ?? 0)
					};
				} catch {
					return null;
				}
			}
			function writeDispatchMemo(memo) {
				try {
					window.localStorage.setItem(DISPATCH_KEY, JSON.stringify({
						...memo,
						at: Date.now()
					}));
				} catch {}
			}
			function clearDispatchMemo(ideaId = "") {
				try {
					const memo = readDispatchMemo();
					if (memo === null || ideaId === "" || memo.ideaId === ideaId) window.localStorage.removeItem(DISPATCH_KEY);
				} catch {}
			}
			/** 派发早期到达、但 chat 实例还没创建时先缓存，打开抽屉时补渲染。 */
			const pendingChatEvents = [];
			/** 页内会话说：轮询宿主事件的下标与定时器。 */
			let chatPolling = 0;
			let chatSeq = 0;
			let lastRunProgressKey = "";
			let lastRunProgressAt = 0;
			let mind = null;
			let mindCls = null;
			let chart = null;
			let echartsLoading = null;
			let mindLoading = null;
			let resizeObserver = null;
			const plot = () => rootNode.getElementById("idea-plot");
			function q(id) {
				return rootNode.getElementById(id);
			}
			async function api(path, init = {}) {
				const options = {
					method: init.method ?? "GET",
					headers: {}
				};
				if (init.body !== void 0) {
					options.headers["content-type"] = "application/json";
					options.body = JSON.stringify(init.body);
				}
				const res = await fetch(`${deps.api}${path}`, options);
				let body = null;
				try {
					body = await res.json();
				} catch {
					body = null;
				}
				return {
					ok: res.ok,
					status: res.status,
					body
				};
			}
			function build() {
				if (built) return;
				built = true;
				const style = document.createElement("style");
				style.id = "dsh-workbench-idea-css";
				style.textContent = IDEA_CSS;
				rootNode.appendChild(style);
				host.innerHTML = `
      <div class="idea-root" id="idea-root">
        <aside class="idea-list">
          <div class="idea-list-head">
            <div class="idea-list-title">${deps.ic("spark", 14)}<span>灵感</span><span class="n" id="idea-count"></span><button class="icon-btn" data-idea-act="idea-new" title="新建灵感（文字 / 截图 / 链接）" style="margin-left:auto">＋</button></div>
            <div class="idea-project" id="idea-project-box"></div>
            <div class="idea-search">${deps.ic("search", 12)}<input id="idea-search" data-idea-input="search" placeholder="搜索标题或正文"></div>
            <div class="idea-filter" id="idea-filter"></div>
          </div>
          <div class="idea-items" id="idea-items"></div>
          <div class="idea-list-foot"><span id="idea-foot">—</span><button class="btn tiny" data-idea-act="idea-new" style="margin-left:auto">＋ 新建</button></div>
        </aside>
        <section class="idea-canvas">
          <div class="idea-bar" id="idea-bar"></div>
          <div class="idea-sub" id="idea-sub"></div>
          <div class="idea-progress" id="idea-progress" style="display:none"></div>
          <div class="idea-plot" id="idea-plot"></div>
        </section>
        <aside class="idea-detail" id="idea-detail"></aside>
        <aside class="idea-chat" id="idea-chat" style="display:none"></aside>
      </div>`;
				rootNode.addEventListener("click", onClick, true);
				rootNode.addEventListener("input", onInput, true);
				rootNode.addEventListener("change", onChange, true);
				rootNode.addEventListener("keydown", onKeydown, true);
				resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onResize()) : null;
				const target = plot();
				if (target) {
					resizeObserver?.observe(target);
					target.addEventListener("contextmenu", onPlotContext);
					target.addEventListener("dblclick", onPlotDblClick, true);
				}
			}
			async function ensure() {
				build();
				try {
					const saved = window.localStorage.getItem("dsh-workbench.idea.direction");
					if (saved === "right" || saved === "side" || saved === "down" || saved === "left") direction = saved;
				} catch {}
				if (loading || booted) return;
				loading = true;
				try {
					if (projects.length === 0) await loadProjects();
					if (await syncPortalProjects(true) > 0) await loadProjects();
					await loadIdeas();
					if (selectedId === "" && ideas.length > 0) await selectIdea(ideas[0].id);
					else if (selectedId !== "") await reloadDetail();
				} finally {
					loading = false;
					booted = true;
					renderAll();
				}
			}
			async function loadProjects() {
				const res = await api("/ideas/projects");
				if (res.ok && Array.isArray(res.body?.projects)) projects = res.body.projects;
			}
			/**
			* 把门户里的项目同步成灵感项目（按工作区路径去重）。
			* 门户项目来自产品 / Bug 项目 / 测试项目 / 任务的工作区路径，灵感项目需要自己的行来挂截图与产物。
			*/
			async function syncPortalProjects(silent) {
				const candidates = deps.portalProjects?.() ?? [];
				if (candidates.length === 0) return 0;
				const byPath = /* @__PURE__ */ new Map();
				for (const item of candidates) {
					const path = String(item.workspacePath ?? "").trim();
					if (path === "" || path === "all" || path === "none") continue;
					if (!byPath.has(path)) byPath.set(path, {
						name: item.name || path.split("/").filter(Boolean).pop() || path,
						workspacePath: path
					});
				}
				let added = 0;
				for (const item of byPath.values()) try {
					const res = await api("/ideas/projects", {
						method: "POST",
						body: item
					});
					if (res.ok && res.body?.created === true) added += 1;
				} catch {}
				if (!silent) deps.toast(added > 0 ? `已从门户同步 ${added} 个项目` : "门户项目已是最新");
				return added;
			}
			async function loadIdeas() {
				const params = new URLSearchParams();
				if (projectFilter !== "") params.set("projectId", projectFilter);
				if (query.trim() !== "") params.set("q", query.trim());
				const res = await api(`/ideas?${params.toString()}`);
				if (res.ok && Array.isArray(res.body?.ideas)) ideas = res.body.ideas;
			}
			async function selectIdea(id) {
				if (id === selectedId && detail !== null) return;
				stopPolling();
				stopChatPolling();
				chatSeq = 0;
				closeChatTimer();
				dispatchId = "";
				dispatchSessionId = "";
				chat?.clear();
				const chatEl = q("idea-chat");
				if (chatEl !== null) chatEl.style.display = "none";
				selectedId = id;
				selectedNode = "";
				preview = null;
				await reloadDetail();
				await restoreDispatchMemo();
			}
			async function reloadDetail() {
				if (selectedId === "") {
					detail = null;
					return;
				}
				const res = await api(`/ideas/${selectedId}`);
				if (!res.ok) {
					deps.toast(`读取灵感失败：${res.body?.message ?? res.status}`);
					return;
				}
				detail = {
					idea: res.body.idea,
					inputs: res.body.inputs ?? [],
					versions: res.body.versions ?? [],
					run: res.body.run ?? null
				};
				const graph = detail.idea?.graph;
				if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) draft = {
					rev: Number(detail.idea.draftRev ?? 0),
					graph
				};
				else draft = {
					rev: Number(detail.idea?.draftRev ?? 0),
					graph: EMPTY_GRAPH
				};
				run = detail.run;
				if (run?.status === "running") startPolling();
			}
			function renderAll() {
				renderProjectBox();
				renderList();
				renderBar();
				renderSub();
				renderDetail();
				renderPlot();
			}
			function statusDot(status) {
				return status === "ready" ? "ready" : status === "generating" ? "generating" : status === "failed" ? "failed" : "";
			}
			function renderList() {
				const items = q("idea-items");
				const count = q("idea-count");
				const foot = q("idea-foot");
				const filterBox = q("idea-filter");
				if (items === null) return;
				if (count) count.textContent = `${ideas.length} 个`;
				if (foot) foot.textContent = projectFilter === "" ? `共 ${ideas.length} 个 · 按最近更新` : `项目内 ${ideas.length} 个`;
				if (filterBox) {
					const counts = {
						all: ideas.length,
						ready: ideas.filter((i) => i.status === "ready").length,
						draft: ideas.filter((i) => i.status === "draft").length,
						generating: ideas.filter((i) => i.status === "generating").length
					};
					filterBox.innerHTML = [
						["all", "全部"],
						["ready", "已出图"],
						["draft", "草稿"],
						["generating", "生成中"]
					].map(([key, label]) => `<button class="${filter === key ? "on" : ""}" data-idea-act="idea-filter" data-filter="${key}">${label} ${counts[key]}</button>`).join("");
				}
				const visible = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);
				items.innerHTML = visible.length === 0 ? `<div class="idea-empty"><b>还没有灵感</b>把一句想法、几张截图或一个链接丢进来，AI 会从 6 个方向炸开一张图。</div>` : visible.map((item) => `<div class="idea-item${item.id === selectedId ? " on" : ""}" data-idea-act="idea-pick" data-id="${item.id}">
          <div class="idea-item-t"><i class="${statusDot(item.status)}"></i><b>${deps.esc(item.title)}</b></div>
          <div class="idea-item-m"><span>${item.versionSeq > 0 ? `v${item.versionSeq}` : "草稿"}</span><span>${item.nodeCount} 节点</span><span>${shortTime(item.updatedAt)}</span></div>
        </div>`).join("");
			}
			function renderProjectBox() {
				const box = q("idea-project-box");
				if (box === null) return;
				const current = projectFilter === "" ? "" : projectFilter;
				box.innerHTML = `<select data-idea-input="project" title="按项目筛选（关联 DSH 工作区）">
        <option value=""${current === "" ? " selected" : ""}>全部项目</option>
        ${projects.map((p) => `<option value="${p.id}"${current === p.id ? " selected" : ""}>${deps.esc(p.name)}</option>`).join("")}
      </select>
      <button class="icon-btn" data-idea-act="idea-project-manage" title="项目管理">⚙</button>
      <button class="icon-btn" data-idea-act="idea-project-new" title="新建项目">＋</button>`;
			}
			function openProjectModal() {
				const rows = projects.map((p) => `<div class="idea-url-row" style="gap:6px">
        <span title="${deps.esc(p.workspacePath || "未关联工作区")}">${deps.esc(p.name)}<small style="color:var(--text-3);margin-left:6px">${deps.esc(p.workspacePath || "未关联工作区")}</small></span>
        <button class="btn tiny" data-idea-act="idea-project-pick" data-id="${p.id}">使用</button>
        <button class="btn tiny" data-idea-act="idea-project-del" data-id="${p.id}">删除</button>
      </div>`).join("") || "<div style=\"font-size:11px;color:var(--text-3);margin-bottom:8px\">还没有项目；创建后灵感产物会写到项目工作区。</div>";
				deps.openModal(`<div class="idea-modal"><h3>项目（关联工作区）</h3>
      <div class="idea-actions" style="margin:6px 0 10px">
        <button class="btn tiny" data-idea-act="idea-project-sync">⟳ 从门户同步项目</button>
        <span style="font-size:10.5px;color:var(--text-3);align-self:center">门户里的产品 / Bug / 测试项目会按工作区路径自动同步到灵感</span>
      </div>
      <div style="margin:0 0 12px">${rows}</div>
      <div class="m-field"><label>项目名称</label><input type="text" id="idea-project-name" maxlength="60" placeholder="例如：AI 面试陪练"></div>
      <div class="m-field"><label>工作区绝对路径 <span style="font-weight:400">可选</span></label><input type="text" id="idea-project-path" maxlength="500" placeholder="/Users/you/work/ai-coach"></div>
      <div class="idea-modal-foot"><span class="note">截图与导出默认写到 &lt;工作区&gt;/.dsh-workbench/ideas/</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn-primary" data-idea-act="idea-project-save">创建项目</button></div></div></div>`);
			}
			async function syncFromPortal() {
				if (await syncPortalProjects(false) > 0) {
					await loadProjects();
					deps.closeModal();
					renderProjectBox();
					renderAll();
				}
			}
			async function saveProject() {
				const name = q("idea-project-name")?.value.trim() ?? "";
				const workspacePath = q("idea-project-path")?.value.trim() ?? "";
				if (name === "") {
					deps.toast("先填项目名称");
					return;
				}
				const res = await api("/ideas/projects", {
					method: "POST",
					body: {
						name,
						workspacePath
					}
				});
				if (!res.ok) {
					deps.toast(`创建项目失败：${res.body?.message ?? res.status}`);
					return;
				}
				await loadProjects();
				projectFilter = res.body.project.id;
				deps.closeModal();
				renderProjectBox();
				await loadIdeas();
				renderAll();
				deps.toast(`已创建项目「${name}」`);
			}
			async function deleteProject(id) {
				const project = projects.find((p) => p.id === id);
				if (project === void 0) return;
				if (!deps.confirm(`删除项目「${project.name}」及其下所有灵感？`)) return;
				if (!(await api(`/ideas/projects/${encodeURIComponent(id)}`, { method: "DELETE" })).ok) {
					deps.toast("删除失败");
					return;
				}
				if (projectFilter === id) projectFilter = "";
				deps.closeModal();
				await loadProjects();
				await loadIdeas();
				if (selectedId !== "" && !ideas.some((i) => i.id === selectedId)) {
					selectedId = "";
					detail = null;
					if (ideas.length > 0) await selectIdea(ideas[0].id);
				}
				renderAll();
				deps.toast("项目已删除");
			}
			function shortTime(value) {
				if (!value) return "";
				const date = new Date(value.replace(" ", "T"));
				if (Number.isNaN(date.getTime())) return value.slice(0, 10);
				const diff = Date.now() - date.getTime();
				if (diff < 6e4) return "刚刚";
				if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
				if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
				return value.slice(5, 16);
			}
			function renderBar() {
				const bar = q("idea-bar");
				if (bar === null) return;
				const hasIdea = detail !== null;
				const stats = graphStats(draft.graph);
				bar.innerHTML = `
      <span class="idea-seg">
        <button class="${view === "tree" ? "on" : ""}" data-idea-act="idea-view" data-view="tree">思维导图</button>
        <button class="${view === "force" ? "on" : ""}" data-idea-act="idea-view" data-view="force">力导图</button>
      </span>
      ${view === "tree" ? `<span class="idea-seg">
        <button class="${direction === "right" ? "on" : ""}" data-idea-act="idea-direction" data-dir="right">右向</button>
        <button class="${direction === "side" ? "on" : ""}" data-idea-act="idea-direction" data-dir="side">双翼</button>
        <button class="${direction === "down" ? "on" : ""}" data-idea-act="idea-direction" data-dir="down">纵向</button>
        <button class="${direction === "left" ? "on" : ""}" data-idea-act="idea-direction" data-dir="left">左向</button>
      </span>` : ""}
      <span class="grow"></span>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="in" ${hasIdea ? "" : "disabled"}>＋</button>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="out" ${hasIdea ? "" : "disabled"}>－</button>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="fit" ${hasIdea ? "" : "disabled"}>适应</button>
      <button class="btn tiny" data-idea-act="idea-chat-toggle" ${dispatchId === "" ? "disabled" : ""}>会话</button>
      <button class="btn tiny" data-idea-act="idea-export" ${hasIdea ? "" : "disabled"}>导出 ▾</button>
      <button class="btn tiny" data-idea-act="idea-node-add" ${hasIdea ? "" : "disabled"}>＋ 节点</button>
      <button class="btn tiny" data-idea-act="idea-archive" ${hasIdea ? "" : "disabled"}>存档版本</button>
      <button class="btn-primary" style="height:26px;font-size:11.5px" data-idea-act="idea-generate" ${hasIdea && run?.status !== "running" ? "" : "disabled"} ${hasIdea && stats.nodes > 1 ? "title=\"重新发散会新建版本\"" : ""}>${run?.status === "running" ? "生成中…" : "✦ 生成"}</button>`;
			}
			function renderSub() {
				const sub = q("idea-sub");
				const progress = q("idea-progress");
				if (sub === null) return;
				if (detail === null) {
					sub.innerHTML = "<span>选择或新建一个灵感</span>";
					if (progress) progress.style.display = "none";
					return;
				}
				const stats = graphStats(draft.graph);
				const versionText = detail.versions[0] ? `v${detail.versions[0].seq}` : "草稿";
				const project = projects.find((p) => p.id === detail?.idea?.projectId);
				sub.innerHTML = `<span>${deps.esc(detail.idea.title)}</span><span>·</span><span><b>${stats.directions}</b> 方向</span><span>·</span><span><b>${stats.nodes}</b> 节点</span>${stats.relate > 0 ? `<span>·</span><span><b>${stats.relate}</b> 跨支关联</span>` : ""}
      <span class="right">${project ? deps.esc(project.name) : "未归属项目"} · ${versionText}${preview ? ` · 只读预览 v${preview.version.seq} <button class="btn tiny" data-idea-act="idea-version-rollback">回滚到此版本</button><button class="btn tiny" data-idea-act="idea-version-delete">删除此版本</button><button class="btn tiny" data-idea-act="idea-version-back">退出预览</button>` : ""}</span>`;
				if (progress) {
					if (run !== null && (run.status === "running" || run.status === "failed")) {
						progress.style.display = "";
						const pct = run.total > 0 ? Math.min(100, Math.round(run.step / run.total * 100)) : 8;
						progress.innerHTML = `<span style="color:var(--accent);font-weight:700">✦ ${run.status === "failed" ? "生成失败" : "AI 发散中"}</span>
          <span class="chip">${run.step}/${run.total}</span><div class="bar"><i style="width:${run.status === "failed" ? 100 : pct}%"></i></div>
          <span>${deps.esc(run.status === "failed" ? run.error || "生成失败" : run.message)}</span>
          ${run.status === "running" ? "<button class=\"btn tiny\" data-idea-act=\"idea-stop\" style=\"margin-left:auto\">停止</button>" : `<button class="btn tiny" data-idea-act="idea-generate" style="margin-left:auto">重试</button>`}`;
					} else progress.style.display = "none";
				}
			}
			function renderDetail() {
				const box = q("idea-detail");
				if (box === null) return;
				if (detail === null) {
					box.innerHTML = `<div class="idea-d-head"><div class="idea-eyebrow">Inspiration</div><div class="idea-d-title">还没有选中灵感</div>
        <div class="idea-d-sub">左侧列表选择，或点「新建」开始</div></div>`;
					return;
				}
				const node = selectedNode === "" ? void 0 : nodeById(draft.graph, selectedNode);
				const inputs = detail.inputs;
				const versions = detail.versions;
				const head = node === void 0 ? `<div class="idea-d-head"><div class="idea-eyebrow">Inspiration</div><div class="idea-d-title">${deps.esc(detail.idea.title)} <span class="idea-chip ${detail.idea.status === "ready" ? "ok" : detail.idea.status === "generating" ? "warn" : ""}">${statusLabel(detail.idea.status)}</span></div>
          <div class="idea-d-sub">${versions[0] ? `v${versions[0].seq} · ` : ""}${graphStats(draft.graph).nodes} 节点 · ${shortTime(detail.idea.updatedAt)}</div></div>` : `<div class="idea-d-head"><div style="display:flex;align-items:center;gap:8px"><button class="btn tiny" data-idea-act="idea-back-overview">← 灵感概览</button><div class="idea-eyebrow" style="margin:0">${node.type === "direction" ? "Direction" : node.type === "seed" ? "Seed" : "Idea"}</div></div>
          <div class="idea-d-title">${deps.esc(node.label)}</div>
          <div class="idea-d-sub">深度 ${node.depth ?? 0} · ${node.angle ? angleLabel(node.angle) : "无角度"} · ${node.status === "dropped" ? "已放弃" : node.status === "pending" ? "待验证" : "已采纳"}</div></div>`;
				const body = [];
				if (node === void 0) {
					body.push(`<div class="idea-sec"><h4>输入</h4><div class="idea-quote">${deps.esc(detail.idea.brief || "（未填写正文）")}</div>
        <div class="idea-actions" style="margin-top:8px">
          <span class="idea-chip">🖼 截图 ${inputs.filter((i) => i.kind === "image").length}</span>
          <span class="idea-chip">🔗 链接 ${inputs.filter((i) => i.kind === "url").length}</span>
          <button class="btn tiny" data-idea-act="idea-edit">编辑输入</button>
        </div>
        <div class="idea-quick"><textarea id="idea-quick-text" rows="2" placeholder="补充一句想法（Ctrl/⌘+Enter 添加）"></textarea><button class="btn tiny" data-idea-act="idea-quick-text">＋ 添加文字</button></div>
        ${inputs.filter((i) => i.kind === "text").length > 0 ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${inputs.filter((i) => i.kind === "text").slice(-3).map((i) => `<span style="font-size:10.5px;color:var(--text-3)">· ${deps.esc(i.text)}</span>`).join("")}</div>` : ""}
      </div>`);
					body.push(`<div class="idea-sec"><h4>发散角度<span class="right">点选下次生效</span></h4><div class="idea-angles">
        ${IDEA_ANGLES.map((a) => `<button class="${anglesOfCurrent().includes(a.id) ? "on" : ""}" data-idea-act="idea-angle" data-id="${a.id}" title="${deps.esc(a.hint)}">${a.label}</button>`).join("")}
        <button class="${anglesOfCurrent().includes("cross") ? "on" : ""}" data-idea-act="idea-angle" data-id="cross">跨界类比</button>
        ${customAngles().map((a) => `<button class="${anglesOfCurrent().includes(a.id) ? "on" : ""}" data-idea-act="idea-angle" data-id="${a.id}" title="自定义角度"><span style="color:${angleColorFor(a.id)}">◆</span> ${deps.esc(a.label)} <span data-idea-act="idea-angle-del" data-id="${a.id}" title="删除这个角度" style="opacity:.55;padding:0 2px">×</span></button>`).join("")}
        <button data-idea-act="idea-angle-add">＋ 自定义</button>
      </div></div>`);
					body.push(`<div class="idea-sec"><h4>操作</h4><div class="idea-actions">
        <button class="btn tiny" data-idea-act="idea-generate">✦ 重新发散</button>
        <button class="btn tiny" data-idea-act="idea-archive">存档版本</button>
        <button class="btn tiny" data-idea-act="idea-diff">版本对比</button>
        <button class="btn tiny" data-idea-act="idea-delete">删除灵感</button>
      </div></div>`);
					body.push(versionList(versions));
					if (run !== null && run.log.length > 0) body.push(`<div class="idea-sec"><h4>进度日志</h4><div class="idea-run-log">${run.log.slice(-6).map((line) => `<div><i>${line.at.slice(11, 16)}</i><span>${deps.esc(line.message)}</span></div>`).join("")}</div></div>`);
				} else {
					body.push(`<div class="idea-sec"><h4>这个节点</h4>
        <dl class="idea-kv">
          <dt>类型</dt><dd>${node.type}</dd>
          <dt>角度</dt><dd>${node.angle ? angleLabel(node.angle) : "—"}</dd>
          <dt>状态</dt><dd>${node.status === "dropped" ? "已放弃" : node.status === "pending" ? "待验证" : "已采纳"}</dd>
        </dl>
        ${node.detail ? `<div class="idea-quote" style="margin-top:8px">${deps.esc(node.detail)}</div>` : ""}
        <div class="idea-actions" style="margin-top:8px">
          <button class="btn tiny" data-idea-act="idea-node-status" data-status="kept">采纳</button>
          <button class="btn tiny" data-idea-act="idea-node-status" data-status="dropped">放弃</button>
          <button class="btn tiny" data-idea-act="idea-node-edit">改文案</button>
          <button class="btn tiny" data-idea-act="idea-node-delete">删除节点</button>
        </div></div>`);
					body.push(`<div class="idea-sec"><h4>继续发散</h4>
        <div class="idea-actions"><button class="btn-primary" style="height:26px;font-size:11.5px" data-idea-act="idea-continue">✦ 沿这个方向再发散</button>
        <button class="btn tiny" data-idea-act="idea-node-add">＋ 手动加子节点</button></div>
        <div style="margin-top:8px;font-size:10.5px;color:var(--text-3)">默认 3 条；只长这一支，其他节点不动</div></div>`);
					body.push(versionList(versions));
				}
				box.innerHTML = `${head}<div class="idea-d-body">${body.join("")}</div>`;
			}
			function statusLabel(status) {
				return status === "ready" ? "已出图" : status === "generating" ? "生成中" : status === "failed" ? "生成失败" : "草稿";
			}
			function versionList(versions) {
				if (versions.length === 0) return `<div class="idea-sec"><h4>版本</h4><div style="font-size:11px;color:var(--text-3)">生成或存档后会在这里出现版本</div></div>`;
				return `<div class="idea-sec"><h4>版本<span class="right">${versions.length} 个${versions.length >= 2 ? " · <button class=\"btn tiny\" data-idea-act=\"idea-diff\">对比</button>" : ""}</span></h4><div class="idea-vers">
      ${versions.slice(0, 12).map((version) => `<div class="idea-ver${preview?.version.id === version.id ? " on" : ""}" data-idea-act="idea-version" data-id="${version.id}">
        <span class="tag ${version.source === "ai" ? "ai" : ""}">${version.source === "ai" ? "AI" : version.source === "manual" ? "手动" : "恢复"}</span>
        <span class="t">${deps.esc(version.label || `v${version.seq}`)}</span>
        <span class="d">v${version.seq} · ${version.nodeCount}</span>
      </div>`).join("")}
    </div></div>`;
			}
			/** 生成用的角度：表单里是临时选择，详情面板里是本地偏好。 */
			let anglePref = IDEA_ANGLES.map((a) => a.id);
			function anglesOfCurrent() {
				return form?.angles ?? anglePref;
			}
			function customAngles() {
				return Array.isArray(detail?.idea?.customAngles) ? detail.idea.customAngles : [];
			}
			function angleLabel(id) {
				return IDEA_ANGLES.find((a) => a.id === id)?.label ?? (id === "cross" ? "跨界类比" : customAngles().find((a) => a.id === id)?.label ?? id);
			}
			function angleColorFor(id) {
				const colors = {
					users: "#2563eb",
					pain: "#0f9f6e",
					form: "#c27c0e",
					tech: "#7c3aed",
					biz: "#db2777",
					risk: "#0891b2"
				};
				if (colors[id] !== void 0) return colors[id];
				if (id === "cross" || id === "") return "#8b8b98";
				const palette = [
					"#2563eb",
					"#0f9f6e",
					"#c27c0e",
					"#7c3aed",
					"#db2777",
					"#0891b2"
				];
				let hash = 0;
				for (const ch of id) hash = hash * 31 + ch.charCodeAt(0) >>> 0;
				return palette[hash % palette.length];
			}
			function renderPlot() {
				const target = plot();
				if (target === null) return;
				if (preview !== null) {
					target.className = "idea-plot readonly";
					target.innerHTML = graphToSVG(preview.graph, { dark: deps.isDark() });
					return;
				}
				if (detail === null) {
					target.className = "idea-plot";
					target.innerHTML = `<div class="idea-empty" style="padding:60px 20px;text-align:center"><b style="font-size:13px">还没有灵感</b>先写一句想法（也可以贴截图或链接），再让 AI 从 6 个方向发散。
        <div style="margin-top:12px"><button class="btn-primary" data-idea-act="idea-new">＋ 新建灵感</button></div></div>`;
					return;
				}
				target.className = "idea-plot";
				if (view === "tree") {
					if (mind === null) target.innerHTML = "<div class=\"idea-empty\" style=\"padding:48px 20px;text-align:center\">正在加载导图编辑器…</div>";
					renderTree();
				} else renderForce();
			}
			async function loadScript(src, id) {
				const exists = document.getElementById(id);
				if (exists !== null) {
					if (exists.dataset.loaded === "1") return;
					await new Promise((resolve, reject) => {
						exists.addEventListener("load", () => resolve(), { once: true });
						exists.addEventListener("error", () => reject(/* @__PURE__ */ new Error("加载失败")), { once: true });
					});
					return;
				}
				await new Promise((resolve, reject) => {
					const el = document.createElement("script");
					el.id = id;
					el.src = src;
					el.async = true;
					el.onload = () => {
						el.dataset.loaded = "1";
						resolve();
					};
					el.onerror = () => reject(/* @__PURE__ */ new Error(`加载失败：${src}`));
					document.head.appendChild(el);
				});
			}
			function mindDirection(cls) {
				return direction === "left" ? cls.LEFT : direction === "side" ? cls.SIDE : direction === "down" ? cls.DOWN : cls.RIGHT;
			}
			function applyDirection() {
				if (mind === null || !mindCls) return;
				try {
					if (direction === "left") mind.initLeft();
					else if (direction === "side") mind.initSide();
					else if (direction === "down") mind.initDown();
					else mind.initRight();
					renderBar();
				} catch (cause) {
					console.warn("[dsh-workbench] 切换导图方向失败", cause);
				}
			}
			async function ensureMind() {
				if (mind !== null) return mind;
				const target = plot();
				if (target === null) return null;
				if (mindLoading === null) mindLoading = (async () => {
					await loadScript(`${deps.api}/assets/vendor/mind-elixir/MindElixir.iife.js`, "dsh-wb-mind-elixir");
					const ns = window.MindElixir;
					mindCls = ns?.default ?? ns;
					if (typeof mindCls !== "function") throw new Error("mind-elixir 未就绪");
					if (rootNode.getElementById("dsh-wb-mind-css") === null) {
						const link = document.createElement("link");
						link.id = "dsh-wb-mind-css";
						link.rel = "stylesheet";
						link.href = `${deps.api}/assets/vendor/mind-elixir/MindElixir.css`;
						rootNode.appendChild(link);
					}
				})();
				try {
					await mindLoading;
				} catch (cause) {
					console.warn("[dsh-workbench] 导图编辑器加载失败：", cause);
					return null;
				}
				const container = document.createElement("div");
				container.className = "idea-mind";
				container.style.cssText = "width:100%;height:100%";
				target.innerHTML = "";
				target.appendChild(container);
				await waitForSize(target);
				mind = new mindCls({
					el: container,
					direction: mindDirection(mindCls),
					toolBar: false,
					keypress: true,
					contextMenu: false,
					overflowHidden: false,
					theme: deps.isDark() ? mindCls.DARK_THEME : mindCls.THEME
				});
				mind.init(toMindElixir$1(draft.graph));
				try {
					mind.toCenter?.();
				} catch {}
				mind.bus.addListener("operation", () => scheduleMindSync());
				return mind;
			}
			let mindSyncTimer = 0;
			function scheduleMindSync() {
				if (mindSyncTimer !== 0) window.clearTimeout(mindSyncTimer);
				mindSyncTimer = window.setTimeout(() => {
					mindSyncTimer = 0;
					if (mind === null) return;
					try {
						const next = fromMindElixir$1(mind.getData(), draft.graph);
						draft.graph = next;
						persistGraph();
						renderDetail();
						renderSub();
					} catch (cause) {
						console.warn("[dsh-workbench] 导图同步失败", cause);
					}
				}, 450);
			}
			/** 等容器拿到真实尺寸（最多 10 帧 ≈160ms），避免 mind-elixir 按 0 宽初始化。 */
			function waitForSize(el) {
				return new Promise((resolve) => {
					let frames = 0;
					const tick = () => {
						if (el.clientWidth > 40 && el.clientHeight > 40) {
							resolve();
							return;
						}
						frames += 1;
						if (frames >= 10) {
							resolve();
							return;
						}
						window.requestAnimationFrame(tick);
					};
					window.requestAnimationFrame(tick);
				});
			}
			async function renderTree() {
				const instance = await ensureMind();
				if (instance === null) {
					const target = plot();
					if (target) target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() });
					return;
				}
				try {
					instance.refresh(toMindElixir$1(draft.graph));
				} catch (cause) {
					console.warn("[dsh-workbench] 导图刷新失败", cause);
				}
			}
			async function renderForce() {
				const target = plot();
				if (target === null) return;
				if (echartsLoading === null) echartsLoading = loadScript(`${deps.api}/assets/vendor/echarts.min.js`, "dsh-wb-echarts");
				try {
					await echartsLoading;
				} catch (cause) {
					console.warn("[dsh-workbench] 力导图加载失败：", cause);
					target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() });
					return;
				}
				const ns = window.echarts;
				if (typeof ns?.init !== "function") {
					target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() });
					return;
				}
				if (chart === null) {
					target.innerHTML = "";
					chart = ns.init(target, null, { renderer: "canvas" });
					chart.on("click", (params) => {
						if (params?.dataType === "node" && typeof params.data?.id === "string") {
							selectedNode = params.data.id;
							renderDetail();
						}
					});
				}
				chart.resize();
				chart.setOption(buildForceOption(draft.graph, { dark: deps.isDark() }), true);
				Array.from(target.querySelectorAll(".idea-legend, .idea-hint")).forEach((node) => node.remove());
				const legend = document.createElement("div");
				legend.className = "idea-legend";
				legend.innerHTML = [...new Set(draft.graph.nodes.map((n) => n.angle ?? ""))].map((angle) => `<span><i style="background:${angleColorOf(angle)}"></i>${angle === "" ? "种子" : angleLabel(angle)}</span>`).join("");
				const hint = document.createElement("div");
				hint.className = "idea-hint";
				hint.textContent = "悬停高亮相邻 · 拖动节点临时移动 · 滚轮缩放 · 虚线 = 跨支关联";
				target.appendChild(legend);
				target.appendChild(hint);
			}
			function angleColorOf(angle) {
				return {
					users: "#2563eb",
					pain: "#0f9f6e",
					form: "#c27c0e",
					tech: "#7c3aed",
					biz: "#db2777",
					risk: "#0891b2",
					cross: "#8b8b98"
				}[angle] ?? "#5b5bd6";
			}
			function disposeEngines() {
				closeNodeMenu();
				if (mind !== null) {
					try {
						mind.destroy();
					} catch {}
					mind = null;
				}
				if (chart !== null) {
					try {
						chart.dispose();
					} catch {}
					chart = null;
				}
				const target = plot();
				if (target) target.innerHTML = "";
			}
			function onResize() {
				if (chart !== null) try {
					chart.resize();
				} catch {}
				if (mind !== null) try {
					const data = mind.getData();
					mind.refresh(data);
				} catch {}
			}
			async function persistGraph() {
				if (selectedId === "" || preview !== null) return;
				try {
					const res = await api(`/ideas/${selectedId}/draft`, {
						method: "PUT",
						body: {
							graph: draft.graph,
							rev: draft.rev
						}
					});
					if (res.status === 409 && res.body?.current) {
						draft = {
							rev: Number(res.body.current.rev ?? 0),
							graph: res.body.current.graph
						};
						deps.toast("导图已在别处更新，已重新载入");
						renderPlot();
						return;
					}
					if (!res.ok) throw new Error(res.body?.message ?? `HTTP ${res.status}`);
					draft.rev = Number(res.body.rev ?? draft.rev);
					if (Array.isArray(res.body.issues) && res.body.issues.length > 0) console.warn("[dsh-workbench] 导图已自动修正：", res.body.issues);
				} catch (cause) {
					deps.toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			function startPolling() {
				if (polling !== 0) return;
				if (run === null) return;
				const runId = run.id;
				polling = window.setInterval(() => {
					poll(runId);
				}, 3e3);
				poll(runId);
			}
			function stopPolling() {
				if (polling !== 0) {
					window.clearInterval(polling);
					polling = 0;
				}
			}
			async function poll(runId) {
				if (selectedId === "") {
					stopPolling();
					return;
				}
				try {
					const res = await api(`/ideas/${selectedId}/runs/${runId}`);
					if (!res.ok) return;
					run = res.body.run;
					const next = res.body.draft;
					if (next?.graph) {
						draft = {
							rev: Number(next.rev ?? draft.rev),
							graph: next.graph
						};
						if (view === "tree" && mind !== null) try {
							mind.refresh(toMindElixir$1(draft.graph));
						} catch {}
						else if (view === "force" && chart !== null) chart.setOption(buildForceOption(draft.graph, { dark: deps.isDark() }), true);
					}
					renderSub();
					renderDetail();
					renderList();
					if (run?.status === "running") {
						const idleLimit = 36e4;
						const progressKey = `${String(run.step ?? "")}/${String(run.total ?? "")}`;
						if (progressKey !== lastRunProgressKey) {
							lastRunProgressKey = progressKey;
							lastRunProgressAt = Date.now();
						}
						if (lastRunProgressAt !== 0 && Date.now() - lastRunProgressAt > idleLimit) {
							await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: "POST" }).catch(() => null);
							stopPolling();
							deps.toast("生成已超过 6 分钟没有进展，已停止；已生成的节点保留为草稿");
							await reloadDetail();
							renderAll();
							return;
						}
					} else {
						lastRunProgressKey = "";
						lastRunProgressAt = 0;
					}
					if (run?.status === "done") {
						stopPolling();
						closeChatTimer();
						clearDispatchMemo(selectedId);
						chat?.setStatus("done");
						busy = "";
						deps.toast("已生成，可在右侧版本里对比");
						await reloadDetail();
						renderAll();
					} else if (run?.status === "failed") {
						stopPolling();
						closeChatTimer();
						clearDispatchMemo(selectedId);
						chat?.setStatus("failed", String(run.error || ""));
						busy = "";
						deps.toast(`生成失败：${run.error || "未知原因"}`);
						renderSub();
					}
				} catch {}
			}
			async function generate(mode, targetNodeId = "") {
				if (selectedId === "") {
					openForm("create");
					return;
				}
				if (busy !== "") return;
				if (run?.status === "running") {
					const dispatch = (await api(`/ideas/${selectedId}/runs/${run.id}`).catch(() => null))?.body?.dispatch;
					if (dispatch !== void 0 && dispatch !== null && ["dispatching", "running"].includes(String(dispatch.status))) {
						deps.toast("这个灵感正在生成中，可先点「停止」再发起");
						return;
					}
					await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: "POST" }).catch(() => null);
					stopPolling();
					await reloadDetail();
					renderAll();
				}
				busy = "generate";
				try {
					await persistGraph();
					const angles = anglesOfCurrent();
					const res = await api(`/ideas/${selectedId}/runs`, {
						method: "POST",
						body: {
							kind: mode,
							targetNodeId,
							angles
						}
					});
					if (!res.ok) {
						deps.toast(`创建生成任务失败：${res.body?.message ?? res.status}`);
						return;
					}
					run = res.body.run;
					renderSub();
					const project = projects.find((p) => p.id === detail?.idea?.projectId);
					const path = String(res.body.workspacePath || project?.workspacePath || "");
					if (deps.agent !== void 0) {
						ensureChat();
						pendingChatEvents.length = 0;
						const started = await deps.agent.dispatch({
							ideaId: selectedId,
							runId: String(run?.id ?? ""),
							teamId: "",
							feature: mode === "continue" ? "idea.continue" : "idea.diverge",
							goal: String(detail?.idea?.brief || detail?.idea?.title || ""),
							ideaTitle: String(detail?.idea?.title ?? ""),
							ideaBrief: String(detail?.idea?.brief ?? ""),
							workspacePath: path,
							timeoutMs: 9e5
						}, {
							event: (event) => {
								if (chat === null) pendingChatEvents.push(event);
								else chat.ingest(event);
							},
							history: (events) => {
								if (chat === null) pendingChatEvents.push(...events);
								else chat.ingestMany(events);
							},
							status: (status, note) => chat?.setStatus(status, note),
							team: (projection) => chat?.setTeam(teamStateOf(projection))
						});
						if (started !== null) {
							dispatchId = started.dispatchId;
							dispatchSessionId = started.sessionId;
							writeDispatchMemo({
								ideaId: selectedId,
								dispatchId,
								sessionId: dispatchSessionId,
								teamName: started.teamName
							});
							openChat(started.teamName, started.timeoutMs);
						}
					} else try {
						await deps.dispatch(path, String(res.body.prompt ?? ""));
					} catch (cause) {
						deps.toast(`派发到会话失败：${String(cause.message ?? cause)}`);
					}
					startPolling();
				} finally {
					busy = "";
				}
			}
			function ensureChat() {
				const el = q("idea-chat");
				if (el === null) return null;
				if (chat === null) {
					chat = createAgentChat(el, {
						esc: deps.esc,
						ic: deps.ic,
						onSend: (text) => {
							if (dispatchSessionId !== "") deps.agent?.prompt(dispatchSessionId, text);
						},
						onStop: () => void stopRun(),
						onRetry: () => void generate("diverge"),
						onOpenSession: () => {
							if (dispatchSessionId !== "") deps.agent?.openSession(dispatchSessionId);
						}
					});
					bindChatResizer(el);
				}
				return chat;
			}
			function openChat(teamName, timeoutMs) {
				const el = q("idea-chat");
				if (el === null) return;
				if (ensureChat() === null) return;
				el.style.display = "";
				if (pendingChatEvents.length > 0) chat?.ingestMany(pendingChatEvents.splice(0, pendingChatEvents.length));
				chat?.open({
					teamName: teamName === "" ? "智能体团队" : teamName,
					dispatchId,
					sessionId: dispatchSessionId,
					timeoutMs
				});
				chat?.setStatus("running");
				if (dispatchSessionId !== "" && typeof deps.agent?.history === "function") deps.agent.history(dispatchSessionId).then((events) => {
					if (events.length > 0) chat?.ingestMany(events);
				}).catch(() => void 0);
				startChatPolling();
				if (dispatchTimer !== 0) window.clearTimeout(dispatchTimer);
				dispatchTimer = window.setTimeout(() => {
					chat?.setStatus("timeout", "超过派发预算");
					stopRun();
				}, timeoutMs);
			}
			/**
			* 轮询宿主侧会话事件。客户端 session/event 订阅在许多宿主版本里收不到宿主会话事件，
			* 这是页内会话能稳定显示「命令 + 对话」的主通道。
			*/
			function startChatPolling() {
				if (chatPolling !== 0) return;
				if (dispatchSessionId === "") return;
				chatPolling = window.setInterval(() => {
					pollChatEvents();
				}, 1500);
				pollChatEvents();
			}
			function stopChatPolling() {
				if (chatPolling !== 0) {
					window.clearInterval(chatPolling);
					chatPolling = 0;
				}
			}
			async function pollChatEvents() {
				if (dispatchSessionId === "") {
					stopChatPolling();
					return;
				}
				try {
					for (let round = 0; round < 8; round += 1) {
						const res = await api(`/agents/sessions/${encodeURIComponent(dispatchSessionId)}/events?since=${chatSeq}`);
						if (!res.ok) return;
						const events = Array.isArray(res.body?.events) ? res.body.events : [];
						if (events.length > 0) chat?.ingestMany(events);
						if (Number(res.body?.available) === 0 || events.length === 0) break;
						const next = Number(res.body?.next ?? 0);
						if (!Number.isFinite(next) || next <= chatSeq) break;
						chatSeq = next;
						if (events.length < 400) break;
					}
				} catch {}
			}
			function closeChatTimer() {
				if (dispatchTimer !== 0) {
					window.clearTimeout(dispatchTimer);
					dispatchTimer = 0;
				}
			}
			/**
			* 恢复上一次的派发现场（页面刷新、切走再切回、或重新打开这个灵感）。
			* 判定链：内存已有 → 什么都不做；本地记录属于当前灵感 → 问后端该 dispatch 是否还活着 →
			* 活着就恢复抽屉与轮询，已结束就只回放历史并标终态，然后清掉记录。
			*/
			async function restoreDispatchMemo() {
				if (dispatchId !== "" || dispatchSessionId !== "") return;
				if (selectedId === "") return;
				const memo = readDispatchMemo();
				if (memo === null || memo.ideaId !== selectedId) return;
				const res = await api(`/agents/dispatches/${encodeURIComponent(memo.dispatchId)}`).catch(() => null);
				if (res === null || !res.ok) {
					clearDispatchMemo(memo.ideaId);
					return;
				}
				const status = String(res.body?.dispatch?.status ?? "");
				const alive = status === "dispatching" || status === "running";
				dispatchId = memo.dispatchId;
				dispatchSessionId = memo.sessionId;
				if (chat === null) ensureChat();
				const el = q("idea-chat");
				if (el !== null) el.style.display = "";
				chat?.open({
					teamName: memo.teamName === "" ? "智能体团队" : memo.teamName,
					dispatchId,
					sessionId: dispatchSessionId,
					timeoutMs: 9e5
				});
				if (alive) {
					chat?.setStatus("running");
					startChatPolling();
					if (dispatchTimer !== 0) window.clearTimeout(dispatchTimer);
					dispatchTimer = window.setTimeout(() => {
						chat?.setStatus("timeout", "超过派发预算");
						stopRun();
					}, 9e5);
				} else {
					chat?.setStatus(status === "done" ? "done" : status === "timeout" ? "timeout" : status === "failed" ? "failed" : "cancelled", String(res.body?.dispatch?.error ?? ""));
					clearDispatchMemo(memo.ideaId);
				}
				if (typeof deps.agent?.history === "function") deps.agent.history(dispatchSessionId).then((events) => {
					if (events.length > 0) chat?.ingestMany(events);
				}).catch(() => void 0);
			}
			/**
			* 会话抽屉左缘拖拽调宽：CSS resize 的手柄在右下角且被圆角/阴影盖住，
			* 实测拖不到，所以自己加一条可见的竖向手柄。
			*/
			function bindChatResizer(el) {
				const KEY = "dsh-workbench.idea.chatWidth";
				try {
					const saved = Number(window.localStorage.getItem(KEY));
					if (Number.isFinite(saved) && saved >= 300) el.style.width = `${Math.min(560, saved)}px`;
				} catch {}
				const handle = document.createElement("div");
				handle.className = "idea-chat-resizer";
				handle.title = "拖动调整宽度";
				el.appendChild(handle);
				handle.addEventListener("pointerdown", (event) => {
					event.preventDefault();
					const startX = event.clientX;
					const startWidth = el.getBoundingClientRect().width;
					handle.setPointerCapture(event.pointerId);
					const move = (e) => {
						const next = Math.max(300, Math.min(560, startWidth + (startX - e.clientX)));
						el.style.width = `${Math.round(next)}px`;
					};
					const up = () => {
						handle.removeEventListener("pointermove", move);
						handle.removeEventListener("pointerup", up);
						handle.removeEventListener("pointercancel", up);
						try {
							window.localStorage.setItem(KEY, String(Math.round(el.getBoundingClientRect().width)));
						} catch {}
					};
					handle.addEventListener("pointermove", move);
					handle.addEventListener("pointerup", up);
					handle.addEventListener("pointercancel", up);
				});
			}
			async function stopRun() {
				if (run === null || selectedId === "") return;
				if (dispatchId !== "" && dispatchSessionId !== "") {
					closeChatTimer();
					clearDispatchMemo(selectedId);
					chat?.setStatus("cancelled");
					await deps.agent?.stop(dispatchId, dispatchSessionId).catch(() => void 0);
				}
				await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: "POST" });
				stopPolling();
				stopChatPolling();
				await reloadDetail();
				renderAll();
			}
			async function previewVersion(versionId) {
				if (selectedId === "") return;
				const res = await api(`/ideas/${selectedId}/versions/${versionId}`);
				if (!res.ok) {
					deps.toast("版本读取失败");
					return;
				}
				preview = {
					version: res.body.version,
					graph: res.body.version.graph
				};
				renderBar();
				renderSub();
				renderDetail();
				renderPlot();
				deps.toast(`只读预览 v${preview.version.seq} · 点节点详情里的「回到最新」退出`);
			}
			async function archive() {
				if (selectedId === "") return;
				const res = await api(`/ideas/${selectedId}/versions`, {
					method: "POST",
					body: { label: `手动存档 ${(/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", {
						hour: "2-digit",
						minute: "2-digit"
					})}` }
				});
				if (!res.ok) {
					deps.toast(`存档失败：${res.body?.message ?? res.status}`);
					return;
				}
				deps.toast(`已存档 v${res.body.version.seq}`);
				await reloadDetail();
				renderAll();
			}
			async function rollback(versionId) {
				if (selectedId === "" || !deps.confirm("回滚会用该版本覆盖当前草稿（历史仍保留），继续？")) return;
				const res = await api(`/ideas/${selectedId}/versions/${versionId}/rollback`, { method: "POST" });
				if (!res.ok) {
					deps.toast(`回滚失败：${res.body?.message ?? res.status}`);
					return;
				}
				preview = null;
				deps.toast(`已回滚，产生 v${res.body.version.seq}`);
				await reloadDetail();
				renderAll();
			}
			async function removeVersion(versionId) {
				const version = preview?.version;
				if (!deps.confirm(`删除版本 v${version?.seq ?? ""}？该版本图不可恢复（草稿不受影响）。`)) return;
				const res = await api(`/ideas/${selectedId}/versions/${versionId}`, { method: "DELETE" });
				if (!res.ok) {
					deps.toast(`删除失败：${res.body?.message ?? res.status}`);
					return;
				}
				preview = null;
				await reloadDetail();
				renderAll();
				deps.toast("版本已删除");
			}
			async function showDiff() {
				if (detail === null || detail.versions.length < 2) {
					deps.toast("至少需要两个版本才能对比");
					return;
				}
				diffState = {
					a: detail.versions[1].id,
					b: detail.versions[0].id
				};
				const options = (selected) => detail.versions.slice(0, 20).map((v) => `<option value="${v.id}"${v.id === selected ? " selected" : ""}>v${v.seq} · ${deps.esc(v.label || "未命名")}${v.source === "ai" ? "（AI）" : ""}</option>`).join("");
				deps.openModal(`<div class="idea-modal" style="width:620px"><h3>版本对比</h3>
      <div class="idea-diff-pick">
        <label>A（基准）<select id="idea-diff-a" data-idea-input="diff-a">${options(diffState.a)}</select></label>
        <button class="btn tiny" data-idea-act="idea-diff-swap" title="交换">⇄</button>
        <label>B（对比）<select id="idea-diff-b" data-idea-input="diff-b">${options(diffState.b)}</select></label>
      </div>
      <div id="idea-diff-body" class="idea-diff"><div style="color:var(--text-3);font-size:11px">对比中…</div></div>
      <div class="idea-modal-foot"><span class="note">对比基于不可变版本，不包含当前草稿</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn" data-idea-act="idea-diff-rollback">回滚到 A</button>
      </div></div></div>`);
				await renderDiffBody();
			}
			function diffList(title, cls, items, render) {
				if (items.length === 0) return `<div class="idea-diff-sec"><h5>${title}</h5><div class="empty">无</div></div>`;
				return `<div class="idea-diff-sec"><h5 class="${cls}">${title}（${items.length}）</h5><ul>${items.map((item) => `<li>${render ? render(item) : deps.esc(item.label)}</li>`).join("")}</ul></div>`;
			}
			async function renderDiffBody() {
				const body = q("idea-diff-body");
				if (body === null || diffState === null || detail === null) return;
				const versionOf = (id) => detail.versions.find((v) => v.id === id);
				const a = versionOf(diffState.a);
				const b = versionOf(diffState.b);
				if (a === void 0 || b === void 0) {
					body.innerHTML = "<div class=\"empty\">版本不存在</div>";
					return;
				}
				if (a.id === b.id) {
					body.innerHTML = "<div class=\"empty\">A 与 B 是同一个版本</div>";
					return;
				}
				body.innerHTML = "<div style=\"color:var(--text-3);font-size:11px\">对比中…</div>";
				const res = await api(`/ideas/${selectedId}/versions/${a.id}/diff/${b.id}`);
				if (!res.ok) {
					body.innerHTML = `<div class="empty">对比失败：${deps.esc(res.body?.message ?? res.status)}</div>`;
					return;
				}
				const diff = res.body.diff;
				body.innerHTML = `
      <div class="idea-diff-sum">
        <span>v${a.seq} → v${b.seq}</span>
        <span class="add">+${diff.added.length}</span>
        <span class="del">-${diff.removed.length}</span>
        <span>改 ${diff.changed.length}</span>
        <span>边 +${diff.addedEdges} / -${diff.removedEdges}</span>
        <span style="margin-left:auto;color:var(--text-3)">节点 ${a.nodeCount} → ${b.nodeCount}</span>
      </div>
      ${diffList("新增节点", "add", diff.added)}
      ${diffList("删除节点", "del", diff.removed)}
      ${diffList("文案修改", "", diff.changed, (item) => `${deps.esc(item.before)} <span style="color:var(--text-3)">→</span> ${deps.esc(item.after)}`)}
      ${diff.added.length + diff.removed.length + diff.changed.length + diff.addedEdges + diff.removedEdges === 0 ? "<div class=\"empty\">两个版本没有差异</div>" : ""}`;
			}
			function download(name, content, mime) {
				const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = name;
				document.body.appendChild(a);
				a.click();
				a.remove();
				window.setTimeout(() => URL.revokeObjectURL(url), 1500);
			}
			async function exportAs(format, toWorkspace = false) {
				if (detail === null) return;
				const graph = preview?.graph ?? draft.graph;
				const base = safeName(preview ? `${detail.idea.title}-v${preview.version.seq}` : detail.idea.title);
				if (format === "png") {
					const svg = graphToSVG(graph, { dark: false });
					try {
						const blob = await svgToPngBlob(svg, 2);
						download(`${base}.png`, blob, "image/png");
						deps.toast("已导出 PNG");
					} catch (cause) {
						deps.toast(`PNG 导出失败：${String(cause.message ?? cause)}`);
					}
					return;
				}
				const content = format === "json" ? JSON.stringify({
					title: detail.idea.title,
					graph
				}, null, 2) : format === "markdown" ? graphToMarkdown(graph) : graphToSVG(graph, { dark: false });
				if (toWorkspace) {
					const res = await api(`/ideas/${selectedId}/export`, {
						method: "POST",
						body: {
							format,
							content,
							toWorkspace: true,
							versionSeq: preview?.version.seq ?? "draft"
						}
					});
					if (!res.ok) {
						deps.toast(`保存失败：${res.body?.message ?? res.status}`);
						return;
					}
					deps.toast(`已保存到工作区：${res.body.filePath}`);
					return;
				}
				const ext = format === "markdown" ? "md" : format;
				download(`${base}.${ext}`, content, format === "json" ? "application/json" : format === "markdown" ? "text/markdown" : "image/svg+xml");
				deps.toast(`已导出 ${ext.toUpperCase()}`);
			}
			function svgToPngBlob(svg, scale) {
				return new Promise((resolve, reject) => {
					const img = new Image();
					const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
					img.onload = () => {
						try {
							const canvas = document.createElement("canvas");
							canvas.width = Math.max(1, Math.round(img.width * scale));
							canvas.height = Math.max(1, Math.round(img.height * scale));
							const ctx = canvas.getContext("2d");
							if (ctx === null) throw new Error("没有 canvas 上下文");
							ctx.fillStyle = "#ffffff";
							ctx.fillRect(0, 0, canvas.width, canvas.height);
							ctx.setTransform(scale, 0, 0, scale, 0, 0);
							ctx.drawImage(img, 0, 0);
							canvas.toBlob((blob) => {
								URL.revokeObjectURL(url);
								blob ? resolve(blob) : reject(/* @__PURE__ */ new Error("toBlob 失败"));
							}, "image/png");
						} catch (cause) {
							URL.revokeObjectURL(url);
							reject(cause);
						}
					};
					img.onerror = () => {
						URL.revokeObjectURL(url);
						reject(/* @__PURE__ */ new Error("SVG 渲染失败"));
					};
					img.src = url;
				});
			}
			function openExportMenu() {
				if (detail === null) return;
				deps.openModal(`<div class="idea-modal"><h3>导出</h3>
      <div class="idea-actions" style="gap:8px;margin:10px 0">
        <button class="btn" data-idea-act="idea-export-go" data-fmt="png">PNG</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="svg">SVG</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="json">JSON</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="markdown">Markdown</button>
      </div>
      <div style="font-size:11px;color:var(--text-3);line-height:1.6">也可以直接存到项目工作区（<code>.dsh-workbench/ideas/…/exports</code>），随项目备份。</div>
      <div class="idea-modal-foot"><span class="note">${preview ? `当前导出的是只读预览 v${preview.version.seq}` : "导出当前草稿"}</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn-primary" data-idea-act="idea-export-workspace">存到工作区</button></div></div></div>`);
			}
			async function openForm(mode) {
				if (mode === "edit" && detail === null) return;
				const idea = mode === "edit" ? detail.idea : null;
				const existing = mode === "edit" ? detail.inputs : [];
				form = {
					id: idea?.id ?? "",
					title: idea?.title ?? "",
					brief: idea?.brief ?? "",
					text: existing.filter((i) => i.kind === "text").map((i) => i.text).join("\n"),
					urls: existing.filter((i) => i.kind === "url").map((i) => i.url),
					images: existing.filter((i) => i.kind === "image").map((i) => ({
						id: i.id,
						name: i.filePath.split("/").pop() ?? "截图"
					})),
					angles: IDEA_ANGLES.map((a) => a.id),
					customAngles: mode === "edit" ? customAngles().map((a) => ({
						id: a.id,
						label: a.label
					})) : [],
					mode
				};
				renderForm();
			}
			function renderForm() {
				if (form === null) return;
				const f = form;
				const customList = f.customAngles ?? [];
				const openPreset = f.preset ?? "";
				const presetBar = IDEA_ANGLE_PRESETS.map((p) => `<button type="button" class="angle-preset${openPreset === p.id ? " on" : ""}" data-idea-act="idea-preset-toggle" data-id="${p.id}" title="${deps.esc(p.hint)}">${deps.esc(p.label)}</button>`).join("");
				const presetBody = openPreset === "" ? "" : (() => {
					const preset = IDEA_ANGLE_PRESETS.find((p) => p.id === openPreset);
					if (preset === void 0) return "";
					const chips = preset.angles.map((a) => {
						const existing = customList.find((c) => c.label === a.label);
						return `<button type="button" class="${existing !== void 0 && f.angles.includes(existing.id) ? "on" : ""}" data-idea-act="idea-preset-angle" data-label="${deps.esc(a.label)}" title="${deps.esc(a.hint)}">${deps.esc(a.label)}</button>`;
					}).join("");
					return `<div class="angle-preset-body"><div class="angle-preset-hint">${deps.esc(preset.hint)} · 点选加入（自定义维度上限 6 个）</div><div class="idea-angles">${chips}</div></div>`;
				})();
				const angleButtons = IDEA_ANGLES.map((a) => `<button type="button" class="${f.angles.includes(a.id) ? "on" : ""}" data-idea-act="idea-modal-angle" data-id="${a.id}" title="${deps.esc(a.hint)}">${a.label}</button>`).join("") + `<button type="button" class="${f.angles.includes("cross") ? "on" : ""}" data-idea-act="idea-modal-angle" data-id="cross">跨界类比</button>` + customList.map((a) => `<button type="button" class="${f.angles.includes(a.id) ? "on" : ""}" data-idea-act="idea-modal-angle" data-id="${deps.esc(a.id)}" title="自定义角度"><span style="color:${angleColorFor(a.id)}">◆</span> ${deps.esc(a.label)} <span data-idea-act="idea-modal-angle-del" data-id="${deps.esc(a.id)}" title="移除此角度" style="opacity:.55;padding:0 2px">×</span></button>`).join("") + `<button type="button" class="btn tiny" data-idea-act="idea-modal-angle-add" title="添加自定义发散维度">＋ 自定义</button>`;
				const thumbs = f.images.map((img, index) => `<div class="idea-thumb" title="${deps.esc(img.name ?? "截图")}">${img.dataUrl ? `<img src="${img.dataUrl}" alt="">` : `<span>${deps.esc(img.name ?? "截图")}</span>`}<span class="x" data-idea-act="idea-modal-image-del" data-index="${index}">×</span></div>`).join("");
				const urls = f.urls.map((url, index) => `<div class="idea-url-row"><span>🔗 ${deps.esc(url)}</span><span class="x" data-idea-act="idea-modal-url-del" data-index="${index}">×</span></div>`).join("");
				deps.openModal(`<div class="idea-modal">
      <h3>${f.mode === "create" ? "新建灵感" : "编辑输入"}</h3>
      <div class="m-field"><label>标题</label><input type="text" id="idea-form-title" data-idea-input="form-title" maxlength="60" value="${deps.esc(f.title)}" placeholder="一句话说出这件事"></div>
      <div class="m-field"><label>想法正文</label><textarea id="idea-form-brief" data-idea-input="form-brief" maxlength="5000" placeholder="背景、想解决什么、为什么现在做…">${deps.esc(f.brief)}</textarea></div>
      <div class="m-field"><label>补充文字</label><input type="text" id="idea-form-text" data-idea-input="form-text" maxlength="600" value="${deps.esc(f.text)}" placeholder="可粘贴一句关键描述（可选）"></div>
      <div class="m-field"><label>截图 <span style="font-weight:400">粘贴 / 选择，最多 9 张</span></label>
        <div class="idea-thumbs">${thumbs}<div class="idea-thumb add" data-idea-act="idea-modal-pick">＋ 添加</div></div>
        <input type="file" id="idea-form-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none">
        <div class="m-hint">图片只存本地工作区；生成时由 Agent 读取内容。</div></div>
      <div class="m-field"><label>参考链接</label><div id="idea-form-urls">${urls}</div>
        <div class="m-row"><div class="m-col"><input type="url" id="idea-form-url" data-idea-input="form-url" value="${deps.esc(f.urlDraft ?? "")}" placeholder="https://…"></div>
        <button type="button" class="btn" data-idea-act="idea-modal-url-add">添加</button></div>
        <div class="m-hint">生成时由 Agent 抓摘要；失败不影响生成。</div></div>
      <div class="m-field"><label>发散角度 <span style="font-weight:400">默认全选 · 至少 3 个</span></label>
        <div class="angle-presets"><span class="angle-presets-label">预设维度组</span>${presetBar}</div>
        ${presetBody}
        <div class="idea-angles">${angleButtons}</div></div>
      <div class="idea-modal-foot"><span class="note">生成会新建一个版本，旧版本保留可对比</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">取消</button>
        ${f.mode === "create" ? "<button class=\"btn\" data-idea-act=\"idea-modal-create\">仅保存</button><button class=\"btn-primary\" data-idea-act=\"idea-modal-create-generate\">保存并生成</button>" : "<button class=\"btn-primary\" data-idea-act=\"idea-modal-save\">保存</button>"}
      </div></div></div>`);
				const fileInput = q("idea-form-file");
				if (fileInput !== null) fileInput.onchange = () => {
					addFiles(fileInput.files);
					fileInput.value = "";
				};
				const brief = q("idea-form-brief");
				if (brief !== null) brief.addEventListener("paste", (event) => {
					const files = Array.from(event.clipboardData?.items ?? []).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((f) => f !== null);
					if (files.length > 0) {
						event.preventDefault();
						addFiles(files);
					}
				});
			}
			async function addFiles(files) {
				if (form === null || files === null) return;
				const list = Array.from(files).slice(0, 9 - form.images.length);
				for (const file of list) {
					if (!file.type.startsWith("image/")) continue;
					try {
						const compressed = await compressImage(file);
						form.images.push(compressed);
					} catch (cause) {
						deps.toast(`图片处理失败：${String(cause.message ?? cause)}`);
					}
				}
				renderForm();
			}
			function compressImage(file) {
				return new Promise((resolve, reject) => {
					const url = URL.createObjectURL(file);
					const img = new Image();
					img.onload = () => {
						try {
							const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
							const width = Math.max(1, Math.round(img.width * scale));
							const height = Math.max(1, Math.round(img.height * scale));
							const canvas = document.createElement("canvas");
							canvas.width = width;
							canvas.height = height;
							const ctx = canvas.getContext("2d");
							if (ctx === null) throw new Error("没有 canvas 上下文");
							ctx.drawImage(img, 0, 0, width, height);
							const dataUrl = canvas.toDataURL("image/webp", .86);
							URL.revokeObjectURL(url);
							resolve({
								dataUrl,
								name: file.name || "截图",
								width,
								height
							});
						} catch (cause) {
							URL.revokeObjectURL(url);
							reject(cause);
						}
					};
					img.onerror = () => {
						URL.revokeObjectURL(url);
						reject(/* @__PURE__ */ new Error("图片解码失败"));
					};
					img.src = url;
				});
			}
			async function submitForm(create, thenGenerate = false) {
				if (form === null) return;
				const f = form;
				if (f.title.trim() === "") {
					deps.toast("先给灵感起个标题");
					return;
				}
				if (f.angles.length < 3) {
					deps.toast("至少选 3 个发散角度");
					return;
				}
				busy = "form";
				try {
					let ideaId = f.id;
					if (create) {
						const res = await api("/ideas", {
							method: "POST",
							body: {
								title: f.title.trim(),
								brief: f.brief,
								projectId: projectFilter
							}
						});
						if (!res.ok) {
							deps.toast(`创建失败：${res.body?.message ?? res.status}`);
							return;
						}
						ideaId = res.body.idea.id;
					} else {
						const res = await api(`/ideas/${ideaId}`, {
							method: "PATCH",
							body: {
								title: f.title.trim(),
								brief: f.brief
							}
						});
						if (!res.ok) {
							deps.toast(`保存失败：${res.body?.message ?? res.status}`);
							return;
						}
					}
					const addedAngles = f.customAngles ?? [];
					if (addedAngles.length > 0) {
						const merged = customAngles();
						for (const angle of addedAngles) if (!merged.some((a) => a.id === angle.id || a.label === angle.label)) merged.push({
							id: angle.id,
							label: angle.label
						});
						const angleRes = await api(`/ideas/${ideaId}`, {
							method: "PATCH",
							body: { customAngles: merged.slice(0, 6).map((a) => ({
								id: a.id,
								label: a.label
							})) }
						});
						if (!angleRes.ok) deps.toast(`自定义角度保存失败：${angleRes.body?.message ?? angleRes.status}`);
						anglePref = f.angles.slice();
					}
					for (const url of f.urls) {
						if (f.mode === "edit" && (detail?.inputs ?? []).some((i) => i.kind === "url" && i.url === url)) continue;
						await api(`/ideas/${ideaId}/inputs`, {
							method: "POST",
							body: {
								kind: "url",
								url
							}
						});
					}
					if (f.text.trim() !== "" && !(detail?.inputs ?? []).some((i) => i.kind === "text" && i.text === f.text.trim())) await api(`/ideas/${ideaId}/inputs`, {
						method: "POST",
						body: {
							kind: "text",
							text: f.text.trim()
						}
					});
					for (const image of f.images) {
						if (image.id !== void 0 || image.dataUrl === void 0) continue;
						await api(`/ideas/${ideaId}/inputs`, {
							method: "POST",
							body: {
								kind: "image",
								dataUrl: image.dataUrl,
								name: image.name
							}
						});
					}
					deps.closeModal();
					const shouldGenerate = create && thenGenerate;
					form = null;
					await loadIdeas();
					await selectIdea(ideaId);
					await reloadDetail();
					renderAll();
					if (shouldGenerate) await generate("diverge");
					else deps.toast("已保存；点右上「✦ 生成」开始发散");
				} finally {
					busy = "";
				}
			}
			/**
			* 应用内输入弹窗：Electron 不支持 window.prompt，所有文案输入都走这里。
			* 注意 #wb-modal 是 #wb-idea-root 的兄弟节点，本视图的 onClick/onInput 收不到弹窗内事件，
			* 所以这里在 shadow root 上临时挂捕获监听，结束后在 finishAsk 里统一移除。
			*/
			function askText(title, initial = "", placeholder = "") {
				askResolve?.(null);
				askDispose?.();
				askValue = initial;
				return new Promise((resolve) => {
					askResolve = resolve;
					deps.openModal(`<div class="idea-modal"><h3>${deps.esc(title)}</h3>
        <div class="m-field"><input type="text" id="idea-ask-input" data-idea-input="ask" maxlength="120" value="${deps.esc(initial)}" placeholder="${deps.esc(placeholder)}"></div>
        <div class="idea-modal-foot"><span class="note">Enter 确定 · Esc 取消</span><div class="right">
          <button class="btn" data-idea-act="idea-ask-cancel">取消</button>
          <button class="btn-primary" data-idea-act="idea-ask-ok">确定</button>
        </div></div></div>`);
					const scope = rootNode.getRootNode();
					const onModalClick = (event) => {
						const target = event.target;
						const btn = target?.closest("[data-idea-act]");
						if (btn !== null) {
							const act = btn.getAttribute("data-idea-act") ?? "";
							if (act === "idea-ask-ok" || act === "idea-ask-cancel") {
								event.preventDefault();
								event.stopPropagation();
								finishAsk(act === "idea-ask-ok" ? askValue.trim() : null);
							}
							return;
						}
						const overlay = target?.closest("[data-act=\"overlay\"]");
						if (overlay !== null && overlay === target) {
							event.preventDefault();
							event.stopPropagation();
							finishAsk(null);
						}
					};
					const onModalInput = (event) => {
						const el = event.target;
						if (el?.id === "idea-ask-input") askValue = el.value;
					};
					const onModalKey = (event) => {
						const key = event.key;
						if (key === "Enter" && event.target?.id === "idea-ask-input") {
							event.preventDefault();
							event.stopPropagation();
							finishAsk(askValue.trim());
						} else if (key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							finishAsk(null);
						}
					};
					scope.addEventListener("click", onModalClick, true);
					scope.addEventListener("input", onModalInput, true);
					scope.addEventListener("keydown", onModalKey, true);
					askDispose = () => {
						scope.removeEventListener("click", onModalClick, true);
						scope.removeEventListener("input", onModalInput, true);
						scope.removeEventListener("keydown", onModalKey, true);
						askDispose = null;
					};
					window.setTimeout(() => {
						const input = scope.querySelector("#idea-ask-input");
						input?.focus();
						input?.select();
					}, 0);
				});
			}
			function finishAsk(value) {
				const resolve = askResolve;
				askResolve = null;
				askDispose?.();
				deps.closeModal();
				resolve?.(value);
			}
			function slugifyAngle(label) {
				const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
				if (base !== "" && /^[a-z]/.test(base)) return base.slice(0, 20);
				let hash = 0;
				for (const ch of label) hash = hash * 31 + ch.charCodeAt(0) >>> 0;
				return `a-${hash.toString(36)}`;
			}
			async function addCustomAngle() {
				if (selectedId === "" || detail === null) return;
				const input = await askText("自定义角度名称", "", "≤12 字，例如：合规、硬件形态");
				if (input === null) return;
				const label = input.trim().slice(0, 12);
				if (label === "") return;
				if (customAngles().some((a) => a.label === label)) {
					deps.toast("这个角度已经存在");
					return;
				}
				if (customAngles().length >= 6) {
					deps.toast("自定义角度最多 6 个");
					return;
				}
				const id = slugifyAngle(label);
				const next = customAngles().concat([{
					id,
					label
				}]).map((a) => ({
					id: a.id,
					label: a.label
				}));
				const res = await api(`/ideas/${selectedId}`, {
					method: "PATCH",
					body: { customAngles: next }
				});
				if (!res.ok) {
					deps.toast(`添加失败：${res.body?.message ?? res.status}`);
					return;
				}
				anglePref.push(id);
				await reloadDetail();
				renderDetail();
				deps.toast(`已添加角度「${label}」`);
			}
			async function deleteCustomAngle(id) {
				if (selectedId === "" || detail === null) return;
				const next = customAngles().filter((a) => a.id !== id);
				if (!(await api(`/ideas/${selectedId}`, {
					method: "PATCH",
					body: { customAngles: next }
				})).ok) {
					deps.toast("删除失败");
					return;
				}
				const index = anglePref.indexOf(id);
				if (index >= 0) anglePref.splice(index, 1);
				await reloadDetail();
				renderDetail();
			}
			async function setNodeStatus(status) {
				const node = nodeById(draft.graph, selectedNode);
				if (!node) {
					deps.toast("先选中一个节点");
					return;
				}
				node.status = status;
				renderDetail();
				renderList();
				deps.toast(status === "kept" ? `已采纳「${node.label}」` : status === "dropped" ? `已放弃「${node.label}」` : "已标记待验证");
				await persistGraph();
			}
			async function deleteNode() {
				const node = nodeById(draft.graph, selectedNode);
				if (!node || node.id === draft.graph.rootId) return;
				if (!deps.confirm(`删除「${node.label}」及其子节点？`)) return;
				const graph = draft.graph;
				const isTreeEdge = (e) => e.kind === "tree";
				const childMap = /* @__PURE__ */ new Map();
				for (const edge of graph.edges.filter(isTreeEdge)) {
					const list = childMap.get(edge.from) ?? [];
					list.push(edge.to);
					childMap.set(edge.from, list);
				}
				const drop = /* @__PURE__ */ new Set([node.id]);
				const stack = [...childMap.get(node.id) ?? []];
				while (stack.length > 0) {
					const current = stack.pop();
					if (drop.has(current)) continue;
					drop.add(current);
					for (const child of childMap.get(current) ?? []) stack.push(child);
				}
				draft.graph = {
					...graph,
					nodes: graph.nodes.filter((n) => !drop.has(n.id)),
					edges: graph.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to))
				};
				selectedNode = "";
				renderAll();
				await persistGraph();
			}
			async function addSiblingNode() {
				const node = nodeById(draft.graph, selectedNode);
				if (!node) {
					addChildNode();
					return;
				}
				if (node.id === draft.graph.rootId) {
					deps.toast("根节点没有同级");
					return;
				}
				const parentId = node.parentId ?? draft.graph.rootId;
				const label = await askText("新增同级节点", "", "一句话点子（≤24 字）");
				if (label === null) return;
				if (label.trim() === "") {
					deps.toast("名称不能为空");
					return;
				}
				const id = `m-${Math.random().toString(36).slice(2, 8)}`;
				const index = draft.graph.nodes.findIndex((n) => n.id === node.id);
				const next = draft.graph.nodes.slice();
				next.splice(index + 1, 0, {
					id,
					type: node.type,
					label: label.trim().slice(0, 24),
					parentId,
					depth: node.depth,
					angle: node.angle,
					status: "kept"
				});
				draft.graph = {
					...draft.graph,
					nodes: next,
					edges: draft.graph.edges.concat([{
						from: parentId,
						to: id,
						kind: "tree"
					}])
				};
				selectedNode = id;
				renderAll();
				deps.toast(`已新增同级「${label.trim().slice(0, 24)}」`);
				persistGraph();
			}
			function openNodeMenu(x, y, id) {
				const target = plot();
				if (target === null) return;
				closeNodeMenu();
				menuNode = id;
				const node = nodeById(draft.graph, id);
				const isRoot = id === draft.graph.rootId;
				const menu = document.createElement("div");
				menu.className = "idea-menu";
				const maxX = Math.max(4, (target.clientWidth || 600) - 190);
				const maxY = Math.max(4, (target.clientHeight || 500) - 260);
				menu.style.left = `${Math.min(Math.max(4, x), maxX)}px`;
				menu.style.top = `${Math.min(Math.max(4, y), maxY)}px`;
				menu.innerHTML = `
      <button data-idea-act="idea-node-edit">✎ 修改文案</button>
      <button data-idea-act="idea-node-add">＋ 新增子节点</button>
      ${isRoot ? "" : "<button data-idea-act=\"idea-node-sibling\">＋ 新增同级</button>"}
      <button data-idea-act="idea-continue">✦ 发散思维</button>
      <div class="sep"></div>
      <button data-idea-act="idea-node-status" data-status="kept">✓ 采纳</button>
      <button data-idea-act="idea-node-status" data-status="dropped">✕ 放弃</button>
      ${isRoot ? "" : "<div class=\"sep\"></div><button class=\"danger\" data-idea-act=\"idea-node-delete\">🗑 删除该节点</button>"}
      <div class="hint">${deps.esc(node?.label ?? "")}</div>`;
				target.appendChild(menu);
			}
			function closeNodeMenu() {
				menuNode = "";
				const target = plot();
				if (target === null) return;
				target.querySelectorAll(".idea-menu").forEach((node) => node.remove());
			}
			/**
			* mind-elixir 给节点容器的属性是 data-nodeid="me<style 节点 id>"，
			* 而图里的 id 不含前缀。这里按「精确命中优先、去 me 前缀次之」还原成图 id。
			*/
			function graphIdOf(raw) {
				if (raw === "") return "";
				if (nodeById(draft.graph, raw) !== void 0) return raw;
				if (raw.startsWith("me") && nodeById(draft.graph, raw.slice(2)) !== void 0) return raw.slice(2);
				return raw;
			}
			function onPlotContext(event) {
				if (view !== "tree" || preview !== null) return;
				const e = event;
				const nodeEl = e.target?.closest("[data-nodeid]");
				e.preventDefault();
				if (nodeEl === null) {
					closeNodeMenu();
					return;
				}
				const id = graphIdOf(nodeEl.getAttribute("data-nodeid") ?? "");
				if (id === "") return;
				selectedNode = id;
				renderDetail();
				const rect = plot()?.getBoundingClientRect();
				openNodeMenu(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), id);
			}
			function onPlotDblClick(event) {
				if (view !== "tree" || preview !== null) return;
				const nodeEl = event.target?.closest("[data-nodeid]");
				if (nodeEl === null) return;
				event.preventDefault();
				event.stopPropagation();
				const id = graphIdOf(nodeEl.getAttribute("data-nodeid") ?? "");
				if (id === "") return;
				selectedNode = id;
				renderDetail();
				editNodeLabel();
			}
			async function editNodeLabel() {
				const node = nodeById(draft.graph, selectedNode);
				if (!node) return;
				const next = await askText("修改节点文案", node.label, "≤24 字");
				if (next === null) return;
				node.label = next.trim().slice(0, 24) || node.label;
				renderDetail();
				renderPlot();
				persistGraph();
			}
			async function addChildNode() {
				const parent = nodeById(draft.graph, selectedNode) ?? nodeById(draft.graph, draft.graph.rootId);
				if (!parent) return;
				if ((parent.depth ?? 0) + 1 > 4) {
					deps.toast("已经到第 4 层，不能再往下加了");
					return;
				}
				const label = await askText("新增子节点", "", "一句话点子（≤24 字）");
				if (label === null) return;
				if (label.trim() === "") {
					deps.toast("名称不能为空");
					return;
				}
				const id = `m-${Math.random().toString(36).slice(2, 8)}`;
				const depth = (parent.depth ?? 0) + 1;
				draft.graph = {
					...draft.graph,
					nodes: draft.graph.nodes.concat([{
						id,
						type: depth === 1 ? "direction" : "idea",
						label: label.trim().slice(0, 24),
						parentId: parent.id,
						depth,
						angle: parent.angle,
						status: "kept"
					}]),
					edges: draft.graph.edges.concat([{
						from: parent.id,
						to: id,
						kind: "tree"
					}])
				};
				renderAll();
				deps.toast(`已新增「${label.trim().slice(0, 24)}」`);
				persistGraph();
			}
			function onClick(event) {
				const target = event.target;
				const el = target?.closest("[data-idea-act]");
				const appAct = target?.closest("[data-act]");
				if (askResolve !== null && el === null && appAct !== null) {
					const act = appAct.getAttribute("data-act");
					if (act === "overlay" || act === "close-modal") {
						event.preventDefault();
						event.stopPropagation();
						finishAsk(null);
						return;
					}
				}
				if (menuNode !== "" && target?.closest(".idea-menu") === null) closeNodeMenu();
				if (el === null && selectedNode !== "" && target?.closest("#idea-plot") !== null && target?.closest("[data-nodeid]") === null) {
					selectedNode = "";
					renderDetail();
					return;
				}
				if (el === null) return;
				const act = el.getAttribute("data-idea-act") ?? "";
				event.preventDefault();
				event.stopPropagation();
				switch (act) {
					case "idea-new":
						openForm("create");
						break;
					case "idea-edit":
						openForm("edit");
						break;
					case "idea-delete":
						removeIdea();
						break;
					case "idea-direction": {
						const next = el.getAttribute("data-dir") ?? "right";
						if (next !== direction) {
							direction = next;
							try {
								window.localStorage.setItem("dsh-workbench.idea.direction", next);
							} catch {}
							applyDirection();
						}
						break;
					}
					case "idea-project-new":
						openProjectModal();
						break;
					case "idea-project-manage":
						openProjectModal();
						break;
					case "idea-project-save":
						saveProject();
						break;
					case "idea-project-sync":
						syncFromPortal();
						break;
					case "idea-project-del":
						deleteProject(el.getAttribute("data-id") ?? "");
						break;
					case "idea-project-pick":
						projectFilter = el.getAttribute("data-id") ?? "";
						deps.closeModal();
						renderProjectBox();
						loadIdeas().then(() => renderAll());
						break;
					case "idea-version-rollback":
						if (preview !== null) rollback(preview.version.id);
						break;
					case "idea-version-delete":
						if (preview !== null) removeVersion(preview.version.id);
						break;
					case "idea-pick":
						selectIdea(el.getAttribute("data-id") ?? "");
						break;
					case "idea-filter":
						filter = el.getAttribute("data-filter") ?? "all";
						renderList();
						break;
					case "idea-view": {
						const next = el.getAttribute("data-view") ?? "tree";
						if (next !== view) {
							view = next;
							disposeEngines();
							renderBar();
							renderPlot();
						}
						break;
					}
					case "idea-zoom":
						zoom(el.getAttribute("data-dir") ?? "in");
						break;
					case "idea-export":
						openExportMenu();
						break;
					case "idea-export-go":
						exportAs(el.getAttribute("data-fmt") ?? "json");
						break;
					case "idea-export-workspace":
						exportWorkspace();
						break;
					case "idea-archive":
						archive();
						break;
					case "idea-generate":
						generate("diverge");
						break;
					case "idea-continue":
						closeNodeMenu();
						generate("continue", selectedNode);
						break;
					case "idea-stop":
						stopRun();
						break;
					case "idea-angle":
						toggleAngle(el.getAttribute("data-id") ?? "");
						break;
					case "idea-angle-add":
						addCustomAngle();
						break;
					case "idea-angle-del":
						deleteCustomAngle(el.getAttribute("data-id") ?? "");
						break;
					case "idea-node-status":
						closeNodeMenu();
						setNodeStatus(el.getAttribute("data-status") ?? "kept");
						break;
					case "idea-node-delete":
						closeNodeMenu();
						deleteNode();
						break;
					case "idea-node-edit":
						closeNodeMenu();
						editNodeLabel();
						break;
					case "idea-node-add":
						closeNodeMenu();
						addChildNode();
						break;
					case "idea-node-sibling":
						closeNodeMenu();
						addSiblingNode();
						break;
					case "idea-back-overview":
						selectedNode = "";
						closeNodeMenu();
						renderDetail();
						renderPlot();
						break;
					case "idea-version":
						previewVersion(el.getAttribute("data-id") ?? "");
						break;
					case "idea-version-back":
						preview = null;
						renderBar();
						renderSub();
						renderDetail();
						renderPlot();
						break;
					case "idea-chat-toggle": {
						const el = q("idea-chat");
						if (el !== null) el.style.display = el.style.display === "none" ? "" : "none";
						break;
					}
					case "idea-diff":
						showDiff();
						break;
					case "idea-diff-swap":
						if (diffState !== null) {
							const tmp = diffState.a;
							diffState.a = diffState.b;
							diffState.b = tmp;
							const aSel = q("idea-diff-a");
							const bSel = q("idea-diff-b");
							if (aSel) aSel.value = diffState.a;
							if (bSel) bSel.value = diffState.b;
							renderDiffBody();
						}
						break;
					case "idea-diff-rollback":
						if (diffState !== null) {
							deps.closeModal();
							rollback(diffState.a);
						}
						break;
					case "idea-ask-ok":
						finishAsk(askValue.trim());
						break;
					case "idea-ask-cancel":
						finishAsk(null);
						break;
					case "idea-close-modal":
						deps.closeModal();
						break;
					case "idea-modal-pick":
						q("idea-form-file")?.click();
						break;
					case "idea-modal-url-add":
						addUrlFromForm();
						break;
					case "idea-modal-url-del":
						form?.urls.splice(Number(el.getAttribute("data-index") ?? 0), 1);
						renderForm();
						break;
					case "idea-modal-image-del":
						form?.images.splice(Number(el.getAttribute("data-index") ?? 0), 1);
						renderForm();
						break;
					case "idea-modal-angle":
						toggleFormAngle(el.getAttribute("data-id") ?? "");
						break;
					case "idea-modal-angle-add":
						addFormCustomAngle();
						break;
					case "idea-preset-toggle":
						togglePreset(el.getAttribute("data-id") ?? "");
						break;
					case "idea-preset-angle":
						togglePresetAngle(el.getAttribute("data-label") ?? "");
						break;
					case "idea-modal-angle-del":
						removeFormCustomAngle(el.getAttribute("data-id") ?? "");
						break;
					case "idea-modal-create":
						submitForm(true, false);
						break;
					case "idea-modal-create-generate":
						submitForm(true, true);
						break;
					case "idea-quick-text":
						addQuickText();
						break;
					case "idea-modal-save": submitForm(false);
				}
			}
			function onInput(event) {
				const target = event.target;
				if (target === null) return;
				const key = target.getAttribute("data-idea-input") ?? "";
				if (key === "ask") {
					askValue = target.value;
					return;
				}
				if (key === "search") {
					query = target.value;
					if (searchTimer !== 0) window.clearTimeout(searchTimer);
					searchTimer = window.setTimeout(() => {
						searchTimer = 0;
						loadIdeas().then(renderList);
					}, 240);
					return;
				}
				if (form === null) return;
				if (key === "form-title") form.title = target.value.slice(0, 60);
				if (key === "form-brief") form.brief = target.value;
				if (key === "form-text") form.text = target.value;
				if (key === "form-url") form.urlDraft = target.value;
			}
			function onChange(event) {
				const target = event.target;
				if (target === null) return;
				const key = target.getAttribute("data-idea-input");
				if (key === "project") {
					projectFilter = target.value;
					loadIdeas().then(() => renderAll());
					return;
				}
				if ((key === "diff-a" || key === "diff-b") && diffState !== null) {
					if (key === "diff-a") diffState.a = target.value;
					else diffState.b = target.value;
					renderDiffBody();
				}
			}
			function onKeydown(event) {
				const key = event.key;
				if (key === "Escape") {
					if (askResolve !== null) {
						finishAsk(null);
						return;
					}
					if (menuNode !== "") {
						closeNodeMenu();
						return;
					}
					if (form !== null) {
						form = null;
						deps.closeModal();
					} else if (preview !== null) {
						preview = null;
						renderAll();
					}
				}
				if (key === "Enter" && event.target?.id === "idea-ask-input") {
					event.preventDefault();
					finishAsk(askValue.trim());
					return;
				}
				if (key === "Enter" && (event.metaKey || event.ctrlKey) && event.target?.id === "idea-quick-text") {
					event.preventDefault();
					addQuickText();
					return;
				}
				if (key === "Enter" && event.target?.getAttribute("data-idea-input") === "form-url") {
					event.preventDefault();
					addUrlFromForm();
				}
			}
			let searchTimer = 0;
			function addUrlFromForm() {
				if (form === null) return;
				const input = q("idea-form-url");
				const value = (input?.value ?? "").trim();
				if (!/^https?:\/\//i.test(value)) {
					deps.toast("链接要以 http(s):// 开头");
					return;
				}
				if (form.urls.includes(value)) {
					deps.toast("这个链接已经加过了");
					return;
				}
				form.urls.push(value);
				if (input) input.value = "";
				renderForm();
			}
			function toggleFormAngle(id) {
				if (form === null) return;
				const index = form.angles.indexOf(id);
				if (index >= 0) form.angles.splice(index, 1);
				else form.angles.push(id);
				renderForm();
			}
			/** 弹窗内新增自定义发散维度：立刻进本次表单（保存灵感时落到 customAngles）。 */
			async function addFormCustomAngle() {
				if (form === null) return;
				const list = form.customAngles ?? [];
				const builtin = [...IDEA_ANGLES.map((a) => a.label), "跨界类比"];
				if (list.length >= 6) {
					deps.toast("自定义角度最多 6 个");
					return;
				}
				const input = await askText("自定义发散维度", "", "≤12 字，例如：合规、硬件形态、竞品");
				if (input === null) return;
				const label = input.trim().slice(0, 12);
				if (label === "") return;
				if (builtin.includes(label) || list.some((a) => a.label === label) || customAngles().some((a) => a.label === label)) {
					deps.toast("这个角度已经存在");
					return;
				}
				const id = slugifyAngle(label);
				form.customAngles = list.concat([{
					id,
					label
				}]);
				if (!form.angles.includes(id)) form.angles.push(id);
				renderForm();
				deps.toast(`已添加维度「${label}」`);
			}
			/** 移除弹窗内的自定义维度（只影响本次表单，不删库里已有的）。 */
			function removeFormCustomAngle(id) {
				if (form === null) return;
				form.customAngles = (form.customAngles ?? []).filter((a) => a.id !== id);
				form.angles = form.angles.filter((a) => a !== id);
				renderForm();
			}
			/** 展开/收起一个预设维度组（再点一次收起）。 */
			function togglePreset(id) {
				if (form === null) return;
				form.preset = form.preset === id ? "" : id;
				renderForm();
			}
			/** 点选预设维度：加入本次表单的自定义角度（同名复选切换），受 6 个上限约束。 */
			function togglePresetAngle(label) {
				if (form === null) return;
				const list = form.customAngles ?? [];
				const existing = list.find((a) => a.label === label);
				if (existing !== void 0) {
					const on = form.angles.includes(existing.id);
					form.angles = on ? form.angles.filter((a) => a !== existing.id) : form.angles.concat([existing.id]);
					renderForm();
					return;
				}
				if (list.length >= 6) {
					deps.toast("自定义维度最多 6 个");
					return;
				}
				const id = slugifyAngle(label);
				form.customAngles = list.concat([{
					id,
					label
				}]);
				if (!form.angles.includes(id)) form.angles.push(id);
				renderForm();
				deps.toast(`已加入维度「${label}」`);
			}
			async function toggleAngle(id) {
				const index = anglePref.indexOf(id);
				if (index >= 0) anglePref.splice(index, 1);
				else anglePref.push(id);
				renderDetail();
			}
			function zoom(dir) {
				if (mind !== null) {
					const current = Number(mind.scaleVal ?? 1) || 1;
					if (dir === "in") mind.scale(current + .15);
					else if (dir === "out") mind.scale(Math.max(.4, current - .15));
					else {
						mind.scale(1);
						mind.toCenter();
					}
					return;
				}
				if (chart !== null) {
					const option = chart.getOption();
					const zoomNow = Number(option?.series?.[0]?.zoom ?? 1) || 1;
					if (dir === "fit") chart.setOption({ series: [{ zoom: 1 }] });
					else chart.setOption({ series: [{ zoom: Math.min(4, Math.max(.4, zoomNow + (dir === "in" ? .2 : -.2))) }] });
				}
			}
			/** 详情面板里直接补一句文字（不用打开编辑弹窗）。 */
			async function addQuickText() {
				if (selectedId === "") return;
				const el = q("idea-quick-text");
				const text = el?.value.trim() ?? "";
				if (text === "") {
					el?.focus();
					return;
				}
				const res = await api(`/ideas/${selectedId}/inputs`, {
					method: "POST",
					body: {
						kind: "text",
						text
					}
				});
				if (!res.ok) {
					deps.toast(`添加失败：${res.body?.message ?? res.status}`);
					return;
				}
				await reloadDetail();
				renderDetail();
				deps.toast("已添加文字");
			}
			async function removeIdea() {
				if (detail === null) return;
				if (!deps.confirm(`删除灵感「${detail.idea.title}」及其所有版本？`)) return;
				await api(`/ideas/${selectedId}`, { method: "DELETE" });
				selectedId = "";
				detail = null;
				draft = {
					rev: 0,
					graph: EMPTY_GRAPH
				};
				await loadIdeas();
				if (ideas.length > 0) await selectIdea(ideas[0].id);
				renderAll();
				deps.toast("已删除");
			}
			async function exportWorkspace() {
				if (detail === null) return;
				const graph = preview?.graph ?? draft.graph;
				const res = await api(`/ideas/${selectedId}/export`, {
					method: "POST",
					body: {
						format: "markdown",
						content: graphToMarkdown(graph),
						toWorkspace: true,
						versionSeq: preview?.version.seq ?? "draft"
					}
				});
				if (!res.ok) {
					deps.toast(`保存失败：${res.body?.message ?? res.status}`);
					return;
				}
				deps.toast(`已保存：${res.body.filePath}`);
			}
			function show() {
				host.style.display = "";
				ensure();
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						if (host.style.display === "none") return;
						if (mind !== null) try {
							mind.refresh(toMindElixir$1(draft.graph));
						} catch {}
						else renderPlot();
					});
				});
			}
			function hide() {
				host.style.display = "none";
			}
			async function reload() {
				booted = true;
				await loadProjects();
				await loadIdeas();
				if (selectedId !== "") await reloadDetail();
				renderAll();
			}
			function destroy() {
				stopPolling();
				stopChatPolling();
				closeChatTimer();
				askDispose?.();
				chat?.destroy();
				disposeEngines();
				resizeObserver?.disconnect();
				if (mindSyncTimer !== 0) window.clearTimeout(mindSyncTimer);
				rootNode.removeEventListener("click", onClick, true);
				rootNode.removeEventListener("input", onInput, true);
				rootNode.removeEventListener("change", onChange, true);
				rootNode.removeEventListener("keydown", onKeydown, true);
				host.innerHTML = "";
			}
			return {
				ensure,
				show,
				hide,
				destroy,
				reload,
				isMounted: () => built
			};
		}
		// src/client/agent-panel.ts
		const BINDABLE_FEATURES = [
			{
				id: "idea.diverge",
				label: "灵感 · 多方向发散"
			},
			{
				id: "idea.continue",
				label: "灵感 · 节点继续发散"
			},
			{
				id: "idea.review",
				label: "灵感 · 结果评审"
			},
			{
				id: "product.design",
				label: "产品 · 设计发散"
			},
			{
				id: "bug.fix",
				label: "Bug · 修复建议"
			},
			{
				id: "test.design",
				label: "测试 · 用例设计"
			}
		];
		const ROLE_LABEL = {
			lead: "主理人",
			product: "产品",
			architect: "架构",
			frontend: "前端",
			backend: "后端",
			qa: "测试",
			reviewer: "评审",
			custom: "自定义"
		};
		function roleLabel(role) {
			return ROLE_LABEL[role] ?? role;
		}
		function createAgentPanel(deps) {
			let teams = [];
			let members = [];
			let catalog = {
				providers: [],
				skills: [],
				tools: [],
				mcpServers: []
			};
			async function load() {
				try {
					const res = await fetch(`${deps.api}/agents/teams`, { cache: "no-store" });
					if (!res.ok) return;
					const body = await res.json();
					if (Array.isArray(body?.teams)) teams = body.teams;
				} catch {}
				try {
					const res = await fetch(`${deps.api}/agents/members`, { cache: "no-store" });
					if (!res.ok) return;
					const body = await res.json();
					if (Array.isArray(body?.members)) members = body.members;
				} catch {}
			}
			function sectionHtml() {
				const header = `<div class="portal-sec-head"><h2>智能体团队</h2>
      <div class="portal-sec-actions"><span>${teams.length > 0 ? `${teams.length} 支团队` : "默认产品研发团队"}</span>
        <button class="btn tiny" data-act="agent-memory-open">记忆</button>
        <button class="btn tiny" data-act="agent-knowledge-open">知识</button></div></div>`;
				if (teams.length === 0) return `${header}<div class="portal-empty">${deps.ic("users", 16)}<div><b>还没有团队</b><span>创建团队并添加智能体，灵感发散时由主理人调度执行。</span></div><button class="btn" data-act="agent-team-new">${deps.ic("plus", 12)}新建团队</button></div>`;
				return `${header}<div class="portal-teams">${teams.map((team) => `<article class="team-card${team.isDefault ? " default" : ""}" data-act="agent-team-open" data-id="${deps.esc(team.id)}">
      <div class="team-card-h"><span class="team-ico">${deps.ic("users", 16)}</span>
        <div class="team-card-t"><b>${deps.esc(team.name)}</b><small>${team.isDefault ? "默认 · " : ""}${team.memberCount} 名成员</small></div>
        <span class="team-go">${deps.ic("arrowR", 13)}</span></div>
      <div class="team-desc">${deps.esc(team.desc || "未填写说明")}</div>
      <div class="team-members">${(team.members ?? []).slice(0, 8).map((member) => `<span class="team-chip${member.role === "lead" ? " lead" : ""}" title="${deps.esc(member.intro || member.name)}">${deps.esc(member.name)}</span>`).join("") || `<span class="team-chip ghost">${team.memberCount} 名成员</span>`}</div>
    </article>`).join("")}<button class="team-card add" data-act="agent-team-new">${deps.ic("plus", 18)}<span>新建团队</span></button></div>`;
			}
			async function openTeam(id) {
				const res = await fetch(`${deps.api}/agents/teams/${encodeURIComponent(id)}`, { cache: "no-store" });
				if (!res.ok) {
					deps.toast("团队读取失败");
					return;
				}
				const team = (await res.json()).team;
				const rows = (team.members ?? []).map((member) => `<div class="agent-row">
      <div class="agent-row-main"><b>${deps.esc(member.name)}</b><span class="agent-role ${member.role}">${roleLabel(member.role)}</span>
        <small>@${deps.esc(member.handle)} · ${member.fileWrite === "write" ? "可写文件" : "只读"}${member.provider !== "" || member.model !== "" ? ` · ${deps.esc(member.provider !== "" ? `${member.provider}/${member.model}` : member.model)}` : ""}${member.skills.length > 0 ? ` · 技能 ${member.skills.length}` : ""}</small>
        <div class="agent-intro">${deps.esc(member.intro || "（未填写职责）")}</div></div>
      <div class="agent-row-acts">
        <button class="btn tiny" data-act="agent-member-write" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}" title="切换文件权限（下次派发生效）">${member.fileWrite === "write" ? "改只读" : "改可写"}</button>
        <button class="btn tiny" data-act="agent-member-edit" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">编辑</button>
        <button class="btn tiny" data-act="agent-member-del" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">移除</button>
      </div></div>`).join("") || "<div class=\"agent-empty\">还没有成员，先添加一个智能体。</div>";
				const available = members.filter((member) => !(team.members ?? []).some((item) => item.id === member.id));
				deps.openModal(`<div class="agent-modal"><h3>${deps.esc(team.name)}</h3>
      <div class="agent-team-meta">${team.isDefault ? "默认团队 · " : ""}${team.memberCount} 名成员${team.defaultWorkspace !== "" ? ` · ${deps.esc(team.defaultWorkspace)}` : ""}</div>
      ${bindingHtml(team)}
      <div class="agent-list">${rows}</div>
      <div class="agent-add-row">
        <select id="agent-add-select"><option value="">选择已有智能体…</option>${available.map((member) => `<option value="${deps.esc(member.id)}">${deps.esc(member.name)}（${roleLabel(member.role)}）</option>`).join("")}</select>
        <button class="btn tiny" data-act="agent-member-add" data-team="${deps.esc(team.id)}">添加</button>
        <button class="btn tiny" data-act="agent-member-new" data-team="${deps.esc(team.id)}">＋ 新建智能体</button>
        <button class="btn tiny" data-act="agent-team-edit" data-id="${deps.esc(team.id)}">编辑团队</button>
        <span style="margin-left:auto"></span>
        <button class="btn tiny danger" data-act="agent-team-delete" data-id="${deps.esc(team.id)}">删除团队</button>
      </div>
      <div class="agent-foot"><span class="note">运行中改权限不会热生效；下次派发或创建替代成员才生效。</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`);
			}
			async function openMemoryModal() {
				let memories = [];
				try {
					const res = await fetch(`${deps.api}/agents/memory`, { cache: "no-store" });
					if (res.ok) memories = (await res.json()).memories ?? [];
				} catch {}
				const rows = memories.map((item) => `<div class="agent-row"><div class="agent-row-main"><b>[${deps.esc(item.scope)}]</b><div class="agent-intro">${deps.esc(item.content)}</div></div>
      <div class="agent-row-acts"><button class="btn tiny" data-act="agent-memory-del" data-id="${deps.esc(item.id)}">删除</button></div></div>`).join("") || "<div class=\"agent-empty\">还没有记忆。</div>";
				deps.openModal(`<div class="agent-modal"><h3>记忆</h3>
      <div class="agent-team-meta">派发时会按作用域注入；个人/项目也可放文件里</div>
      <div class="agent-list">${rows}</div>
      <div class="m-field"><label>新增记忆</label><textarea id="agent-memory-text" rows="2" placeholder="要长期记住的结论"></textarea></div>
      <div class="agent-add-row"><select id="agent-memory-scope"><option value="project">项目</option><option value="team">团队</option><option value="personal">个人</option></select>
        <button class="btn tiny" data-act="agent-memory-add">添加</button></div>
      <div class="agent-foot"><span class="note">采纳才写入；删除后不再注入</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`);
			}
			async function addMemory() {
				const content = (deps.q("agent-memory-text")?.value ?? "").trim();
				const scope = deps.q("agent-memory-scope")?.value ?? "project";
				if (content === "") {
					deps.toast("先写内容");
					return;
				}
				if (!(await fetch(`${deps.api}/agents/memory`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						scope,
						content
					})
				})).ok) {
					deps.toast("保存失败");
					return;
				}
				await openMemoryModal();
			}
			async function deleteMemory(id) {
				await fetch(`${deps.api}/agents/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
				await openMemoryModal();
			}
			function openKnowledgeModal() {
				const path = teams.find((team) => team.defaultWorkspace !== "")?.defaultWorkspace ?? "";
				deps.openModal(`<div class="agent-modal"><h3>知识</h3>
      <div class="agent-team-meta">索引工作区文本（md/代码等），派发时按任务检索注入</div>
      <div class="agent-add-row"><input id="agent-kb-path" value="${deps.esc(path)}" placeholder="工作区绝对路径" style="flex:1;min-width:0;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px">
        <button class="btn tiny" data-act="agent-knowledge-index">索引</button><button class="btn tiny" data-act="agent-knowledge-status">状态</button></div>
      <div id="agent-kb-status" class="agent-team-meta"></div>
      <div class="agent-add-row" style="margin-top:8px"><input id="agent-kb-q" placeholder="检索测试…" style="flex:1;min-width:0;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px">
        <button class="btn tiny" data-act="agent-knowledge-search">检索</button></div>
      <div id="agent-kb-hits" class="agent-list" style="margin-top:8px"></div>
      <div class="agent-foot"><span class="note">索引按工作区隔离，不会读到别的项目</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`);
			}
			async function indexKnowledge() {
				const path = (deps.q("agent-kb-path")?.value ?? "").trim();
				if (path === "") {
					deps.toast("先填工作区路径");
					return;
				}
				const box = deps.q("agent-kb-status");
				if (box) box.textContent = "索引中…";
				const res = await fetch(`${deps.api}/agents/knowledge/index`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ projectPath: path })
				});
				const body = await res.json().catch(() => ({}));
				if (box) box.textContent = res.ok ? `已索引 ${body.result?.docs ?? 0} 个文件 / ${body.result?.chunks ?? 0} 个片段` : `索引失败：${body?.message ?? res.status}`;
			}
			async function searchKnowledge() {
				const path = (deps.q("agent-kb-path")?.value ?? "").trim();
				const q = (deps.q("agent-kb-q")?.value ?? "").trim();
				const box = deps.q("agent-kb-hits");
				if (path === "" || q === "") {
					deps.toast("先填路径与关键词");
					return;
				}
				const body = await (await fetch(`${deps.api}/agents/knowledge/search?projectPath=${encodeURIComponent(path)}&q=${encodeURIComponent(q)}`)).json().catch(() => ({}));
				if (box) box.innerHTML = (body.hits ?? []).map((hit) => `<div class="agent-row"><div class="agent-row-main"><b>${deps.esc(hit.path)}</b><div class="agent-intro">${deps.esc(hit.chunk)}</div></div></div>`).join("") || "<div class=\"agent-empty\">没有命中</div>";
			}
			/** 按功能绑定候选执行人；主理人固定调度，不进候选列表。 */
			function bindingHtml(team) {
				const bindings = team.bindings ?? {};
				const executors = (team.members ?? []).filter((member) => member.role !== "lead");
				if (executors.length === 0) return "";
				return `<div class="agent-bind"><div class="agent-bind-head">按功能绑定执行人 <small>主理人负责调度；选中多个时由主理人从中分配候选执行</small></div>${BINDABLE_FEATURES.map((feature) => {
					const selected = Array.isArray(bindings[feature.id]) ? bindings[feature.id] : [];
					return `<div class="agent-bind-row">
        <div class="agent-bind-label">${deps.esc(feature.label)}${selected.length === 0 ? "<small>（未绑定：全体成员）</small>" : ""}</div>
        <div class="agent-bind-chips">${executors.map((member) => `<button class="agent-bind-chip${selected.includes(member.id) ? " on" : ""}" data-act="agent-binding-toggle" data-team="${deps.esc(team.id)}" data-feature="${deps.esc(feature.id)}" data-member="${deps.esc(member.id)}">${deps.esc(member.name)}</button>`).join("")}</div>
      </div>`;
				}).join("")}</div>`;
			}
			async function toggleBinding(teamId, feature, memberId) {
				const team = teams.find((item) => item.id === teamId);
				const current = Array.isArray(team?.bindings?.[feature]) ? [...team.bindings[feature]] : [];
				const index = current.indexOf(memberId);
				if (index >= 0) current.splice(index, 1);
				else current.push(memberId);
				const bindings = {
					...team?.bindings ?? {},
					[feature]: current
				};
				if (current.length === 0) delete bindings[feature];
				await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ bindings })
				});
				await load();
				await openTeam(teamId);
				renderPortalRefresh?.();
			}
			function openTeamForm(team) {
				const editing = team !== void 0;
				deps.openModal(`<div class="agent-modal"><h3>${editing ? "编辑团队" : "新建团队"}</h3>
      <div id="agent-team-id" data-id="${editing ? deps.esc(team.id) : ""}" style="display:none"></div>
      <div class="m-field"><label>团队名称</label><input id="agent-team-name" maxlength="40" value="${editing ? deps.esc(team.name) : ""}" placeholder="例如：产品研发"></div>
      <div class="m-field"><label>说明</label><input id="agent-team-desc" maxlength="200" value="${editing ? deps.esc(team.desc ?? "") : ""}" placeholder="这个团队负责什么"></div>
      <div class="m-field"><label>默认工作区（可选）</label><input id="agent-team-ws" maxlength="500" value="${editing ? deps.esc(team.defaultWorkspace ?? "") : ""}" placeholder="/Users/you/work/project"></div>
      <div class="agent-foot"><span class="note">${editing ? "改名只影响显示与后续派发，不影响已有记录" : "创建后进入团队详情添加成员"}</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-team-save">${editing ? "保存" : "创建"}</button></div></div></div>`);
			}
			/** 多选：用 chip 切换，选中值存在隐藏 input 里（逗号分隔）。 */
			function multiSelect(id, values, current, emptyHint) {
				if (values.length === 0) return `<div class="agent-empty" style="padding:8px">${deps.esc(emptyHint)}</div>`;
				return `<div class="agent-multi" data-multi="${id}">${values.map((value) => {
					return `<button type="button" class="agent-multi-item${current.includes(value) ? " on" : ""}" data-act="agent-toggle-option" data-field="${id}" data-value="${deps.esc(value)}">${deps.esc(value)}</button>`;
				}).join("")}</div><input type="hidden" id="${id}" value="${deps.esc(current.join(","))}">`;
			}
			async function loadCatalog() {
				try {
					const res = await fetch(`${deps.api}/agents/options`, { cache: "no-store" });
					if (!res.ok) return;
					const body = await res.json();
					catalog = {
						providers: Array.isArray(body.providers) ? body.providers : [],
						skills: Array.isArray(body.skills) ? body.skills : [],
						tools: Array.isArray(body.tools) ? body.tools : [],
						mcpServers: Array.isArray(body.mcpServers) ? body.mcpServers : []
					};
				} catch {}
			}
			async function openMemberForm(teamId, member) {
				if (catalog.providers.length === 0 && catalog.tools.length === 0) await loadCatalog();
				const m = member;
				deps.openModal(`<div class="agent-modal"><h3>${m ? "编辑智能体" : "新建智能体"}</h3>
      <div class="agent-form-grid">
        <div class="m-field"><label>名称</label><input id="agent-name" maxlength="12" value="${deps.esc(m?.name ?? "")}" placeholder="≤12 字"${m ? " readonly style=\"opacity:.7\"" : ""}></div>
        <div class="m-field"><label>角色</label><select id="agent-role">${[
					"lead",
					"product",
					"architect",
					"frontend",
					"backend",
					"qa",
					"reviewer",
					"custom"
				].map((role) => `<option value="${role}"${m?.role === role ? " selected" : ""}>${roleLabel(role)}</option>`).join("")}</select></div>
        <div class="m-field"><label>文件权限</label><select id="agent-filewrite"><option value="read"${m?.fileWrite === "read" ? " selected" : ""}>只读</option><option value="write"${m?.fileWrite === "write" ? " selected" : ""}>可写</option></select></div>
        <div class="m-field"><label>记忆范围</label><select id="agent-memory">${[
					["none", "不读记忆"],
					["personal", "个人"],
					["project", "项目"],
					["team", "团队"],
					["all", "全部"]
				].map(([scope, label]) => `<option value="${scope}"${(m?.memoryScope ?? "project") === scope ? " selected" : ""}>${label}</option>`).join("")}</select></div>
      </div>
      <div class="m-field"><label>职责（进 kickoff）</label><input id="agent-intro" maxlength="200" value="${deps.esc(m?.intro ?? "")}" placeholder="一句话职责"></div>
      <div class="m-field"><label>系统提示（可选）</label><textarea id="agent-prompt" rows="3" maxlength="4000">${deps.esc(m?.systemPrompt ?? "")}</textarea></div>
      <div class="m-field"><label>模型（来自 DSH 配置，留空跟随默认）</label>
        <div class="agent-form-grid">
          <select id="agent-provider"><option value="">默认 Provider</option>${catalog.providers.map((provider) => `<option value="${deps.esc(provider.id)}"${m?.provider === provider.id ? " selected" : ""}>${deps.esc(provider.name)}</option>`).join("")}</select>
          <select id="agent-model"><option value="">默认 Model</option>${(catalog.providers.find((provider) => provider.id === (m?.provider ?? ""))?.models ?? catalog.providers.flatMap((provider) => provider.models)).map((model) => `<option value="${deps.esc(model)}"${m?.model === model ? " selected" : ""}>${deps.esc(model)}</option>`).join("")}</select>
        </div></div>
      <div class="m-field"><label>工具白名单（DSH 已注册工具，不选=按角色默认）</label>${multiSelect("agent-tools", catalog.tools, m?.tools ?? [], "当前 DSH 未提供工具目录")}</div>
      <div class="m-field"><label>技能（DSH 已安装 skills）</label>${multiSelect("agent-skills", catalog.skills.map((skill) => skill.name), m?.skills ?? [], "当前 DSH 未发现技能")}</div>
      <div class="m-field"><label>MCP 服务（当前连接）</label>${multiSelect("agent-mcp", catalog.mcpServers, m?.mcp ?? [], "当前没有 MCP 服务")}</div>
      <div class="m-field"><label>并发任务数（1–4）</label><input id="agent-concurrency" type="number" min="1" max="4" value="${m?.concurrency ?? 1}"></div>
      <div class="agent-foot"><span class="note">${m ? "名称不可改（DSH 约束）" : "保存后可加入团队"}</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-member-save" data-team="${deps.esc(teamId)}" data-id="${deps.esc(m?.id ?? "")}">保存</button></div></div></div>`);
			}
			function splitList(raw) {
				return raw.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
			}
			function readMemberForm() {
				const value = (id) => (deps.q(id)?.value ?? "").trim();
				return {
					name: value("agent-name"),
					role: value("agent-role"),
					intro: value("agent-intro"),
					systemPrompt: value("agent-prompt"),
					model: value("agent-model"),
					provider: value("agent-provider"),
					fileWrite: value("agent-filewrite"),
					memoryScope: value("agent-memory"),
					tools: splitList(value("agent-tools")),
					skills: splitList(value("agent-skills")),
					mcp: splitList(value("agent-mcp")),
					concurrency: Number(value("agent-concurrency")) || 1
				};
			}
			async function saveMember(teamId, id) {
				const body = readMemberForm();
				if (body.name === "") {
					deps.toast("先填名称");
					return;
				}
				const res = await fetch(`${deps.api}/agents/members${id !== "" ? `/${encodeURIComponent(id)}` : ""}`, {
					method: id !== "" ? "PATCH" : "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ member: body })
				});
				const payload = await res.json().catch(() => ({}));
				if (!res.ok) {
					deps.toast(payload?.issues?.[0]?.message ?? payload?.message ?? "保存失败");
					return;
				}
				if (teamId !== "") await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ memberId: payload.member.id })
				});
				deps.closeModal();
				await load();
				deps.toast("已保存");
				renderPortalRefresh?.();
			}
			async function removeMember(teamId, memberId) {
				if (!deps.confirm("从团队移除这个成员？（不会删除智能体本身）")) return;
				await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
				await load();
				await openTeam(teamId);
				renderPortalRefresh?.();
			}
			async function toggleWrite(teamId, memberId) {
				const next = (teams.find((item) => item.id === teamId)?.members?.find((item) => item.id === memberId))?.fileWrite === "write" ? "read" : "write";
				await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ fileWrite: next })
				});
				await load();
				await openTeam(teamId);
			}
			async function addMemberToTeam(teamId) {
				const memberId = deps.q("agent-add-select")?.value ?? "";
				if (memberId === "") {
					deps.toast("先选择一个智能体");
					return;
				}
				await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ memberId })
				});
				await load();
				await openTeam(teamId);
			}
			async function createTeam() {
				const val = (id) => (deps.q(id)?.value ?? "").trim();
				const name = val("agent-team-name");
				if (name === "") {
					deps.toast("先填团队名称");
					return;
				}
				const editing = deps.q("agent-team-id")?.getAttribute("data-id") ?? "";
				const body = {
					name,
					desc: val("agent-team-desc"),
					defaultWorkspace: val("agent-team-ws")
				};
				if (!(editing === "" ? await fetch(`${deps.api}/agents/teams`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				}) : await fetch(`${deps.api}/agents/teams/${encodeURIComponent(editing)}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				})).ok) {
					deps.toast(editing === "" ? "创建失败" : "保存失败");
					return;
				}
				deps.closeModal();
				await load();
				renderPortalRefresh?.();
				deps.toast(editing === "" ? "团队已创建，进入团队添加成员" : "团队信息已更新");
			}
			async function deleteTeam(id) {
				if (!deps.confirm("删除这个团队？成员本身会保留。")) return;
				await fetch(`${deps.api}/agents/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
				deps.closeModal();
				await load();
				renderPortalRefresh?.();
			}
			function toggleOption(field, value) {
				const input = deps.q(field);
				if (input === null) return;
				const current = splitList(input.value);
				const index = current.indexOf(value);
				if (index >= 0) current.splice(index, 1);
				else current.push(value);
				input.value = current.join(",");
				const box = deps.q(`[data-multi="${field}"]`);
				box?.querySelectorAll("[data-value]").forEach((node) => {
					const el = node;
					el.classList.toggle("on", el.getAttribute("data-value") === value ? index < 0 : current.includes(el.getAttribute("data-value") ?? ""));
				});
				if (box === null) {
					const items = deps.q(`[data-multi="${field}"]`)?.querySelectorAll("[data-value]") ?? [];
					for (const item of Array.from(items)) {
						const el = item;
						el.classList.toggle("on", current.includes(el.getAttribute("data-value") ?? ""));
					}
				}
			}
			let renderPortalRefresh = null;
			function onRefresh(callback) {
				renderPortalRefresh = callback;
			}
			return {
				teams: () => teams,
				members: () => members,
				load,
				sectionHtml,
				openTeam,
				openTeamForm,
				openMemberForm,
				saveMember,
				removeMember,
				toggleWrite,
				addMemberToTeam,
				createTeam,
				deleteTeam,
				openMemoryModal,
				addMemory,
				deleteMemory,
				openKnowledgeModal,
				indexKnowledge,
				searchKnowledge,
				toggleOption,
				toggleBinding,
				loadCatalog,
				onRefresh
			};
		}
		// src/shared/product-graph-model.ts
		const PRODUCT_NODE_KINDS = [
			"root",
			"module",
			"business",
			"feature",
			"requirement"
		];
		const PRODUCT_PLATFORMS = [
			"pc",
			"mobile",
			"tablet",
			"all"
		];
		const PRODUCT_GRAPH_LIMITS = {
			label: 24,
			detail: 200,
			tag: 16,
			tags: 8,
			nodes: 300,
			edges: 600,
			depth: 4,
			graph: 2e6,
			versions: 50,
			summary: 500,
			labelLong: 60
		};
		const PRODUCT_KIND_LABEL = {
			root: "产品",
			module: "模块",
			business: "业务",
			feature: "功能",
			requirement: "需求"
		};
		const PRODUCT_KIND_COLOR = {
			root: "#5b5bd6",
			module: "#2563eb",
			business: "#0f9f6e",
			feature: "#c27c0e",
			requirement: "#db2777"
		};
		function clampText(value, max, ellipsis = false) {
			if (typeof value !== "string") return "";
			const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
			if (clean.length <= max) return clean;
			return ellipsis ? `${clean.slice(0, Math.max(0, max - 1))}…` : clean.slice(0, max);
		}
		function asArray(value) {
			return Array.isArray(value) ? value : [];
		}
		function emptyProductGraph(title) {
			return {
				v: 2,
				rootId: "root",
				nodes: [{
					id: "root",
					label: clampText(title, PRODUCT_GRAPH_LIMITS.label) || "产品",
					kind: "root",
					detail: "",
					depth: 0,
					parentId: null,
					status: "kept"
				}],
				edges: []
			};
		}
		/** `<mapId>:<nodeId>`：同产品另一张导图的节点引用。 */
		function isExternalRef(ref) {
			return typeof ref === "string" && /^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/.test(ref);
		}
		function parseExternalRef(ref) {
			if (!isExternalRef(ref)) return null;
			const index = ref.indexOf(":");
			return {
				mapId: ref.slice(0, index),
				nodeId: ref.slice(index + 1)
			};
		}
		/** 图里的跨图引用边（from 本地 → to 外部）。 */
		function externalEdges(graph) {
			return graph.edges.filter((e) => e.kind === "relate" && isExternalRef(e.to));
		}
		/**
		* 校验并规整一份产品导图（参照灵感 normalizeGraph）：
		* - 节点去重、字段裁剪，超 300 个丢弃并记 issue；
		* - tree 边按 parentId 补全，成环/悬空的挂回根（说出来，不静默）；
		* - depth 由根 BFS 重算，超 4 层（根不计）丢弃；
		* - relate 边两端必须存在（或 to 是合法跨图引用）、不能自连、去重。
		*/
		function normalizeProductGraph(raw, options = {}) {
			const issues = [];
			const fallback = emptyProductGraph(options.title ?? "产品");
			if (raw === null || typeof raw !== "object") return {
				graph: fallback,
				issues
			};
			const input = raw;
			const cleaned = [];
			const seen = new Set(options.knownIds ?? []);
			for (const item of asArray(input.nodes)) {
				if (item === null || typeof item !== "object") continue;
				const node = item;
				const id = clampText(node.id, 64);
				if (id === "") {
					issues.push({
						code: "NODE_ID_EMPTY",
						message: "节点缺少 id，已丢弃"
					});
					continue;
				}
				if (seen.has(id)) {
					issues.push({
						code: "NODE_ID_DUP",
						message: `节点 id 重复：${id}`,
						id
					});
					continue;
				}
				if (cleaned.length >= PRODUCT_GRAPH_LIMITS.nodes) {
					issues.push({
						code: "NODE_LIMIT",
						message: `节点超过 ${PRODUCT_GRAPH_LIMITS.nodes} 个，后续已丢弃`
					});
					break;
				}
				const rawLabel = clampText(node.label ?? node.topic, PRODUCT_GRAPH_LIMITS.label, true);
				const kind = PRODUCT_NODE_KINDS.includes(node.kind) ? node.kind : "feature";
				const label = rawLabel || `未命名${PRODUCT_KIND_LABEL[kind]}`;
				if (String(node.label ?? node.topic ?? "").length > PRODUCT_GRAPH_LIMITS.label) issues.push({
					code: "LABEL_CLAMP",
					message: `节点「${label}」标题超长已裁剪`,
					id
				});
				const status = node.status === "dropped" || node.status === "pending" ? node.status : "kept";
				const tags = asArray(node.tags).map((t) => clampText(t, PRODUCT_GRAPH_LIMITS.tag)).filter(Boolean).slice(0, PRODUCT_GRAPH_LIMITS.tags);
				const platform = PRODUCT_PLATFORMS.includes(node.platform) ? node.platform : void 0;
				const entry = {
					id,
					label,
					kind,
					detail: clampText(node.detail, PRODUCT_GRAPH_LIMITS.detail, true),
					parentId: typeof node.parentId === "string" && node.parentId !== "" ? clampText(node.parentId, 64) : null,
					status,
					platform,
					tags: tags.length > 0 ? tags : void 0
				};
				if (node.collapsed === true) entry.collapsed = true;
				seen.add(id);
				cleaned.push(entry);
			}
			if (cleaned.length === 0) return {
				graph: fallback,
				issues
			};
			const wantedRoot = clampText(input.rootId, 64);
			let rootCandidate = cleaned.find((n) => n.id === wantedRoot && n.kind === "root") ?? cleaned.find((n) => n.kind === "root");
			if (rootCandidate === void 0) {
				if (wantedRoot !== "") {
					rootCandidate = {
						id: wantedRoot,
						label: clampText(options.title, PRODUCT_GRAPH_LIMITS.label) || "产品",
						kind: "root",
						detail: "",
						depth: 0,
						parentId: null,
						status: "kept"
					};
					cleaned.unshift(rootCandidate);
				} else rootCandidate = cleaned[0];
			}
			rootCandidate.kind = "root";
			const rootId = rootCandidate.id;
			const treeParent = /* @__PURE__ */ new Map();
			const relateEdges = [];
			const relateKey = /* @__PURE__ */ new Set();
			for (const edge of asArray(input.edges)) {
				if (edge === null || typeof edge !== "object") continue;
				const e = edge;
				const from = clampText(e.from, 64);
				const to = clampText(e.to, 80);
				if (e.kind === "relate") {
					const external = isExternalRef(to);
					if (!seen.has(from) || from === to) continue;
					if (!external && !seen.has(to)) continue;
					const key = [from, to].sort().join("|");
					if (relateKey.has(key)) continue;
					relateKey.add(key);
					relateEdges.push({
						from,
						to,
						kind: "relate",
						label: clampText(e.label, PRODUCT_GRAPH_LIMITS.label, true) || void 0
					});
					continue;
				}
				if (!seen.has(from) || !seen.has(to) || from === to) continue;
				if (!treeParent.has(to) && to !== rootId) treeParent.set(to, from);
			}
			for (const node of cleaned) {
				if (node.id === rootId || treeParent.has(node.id)) continue;
				if (node.parentId !== null && node.parentId !== void 0 && seen.has(node.parentId) && node.parentId !== node.id) treeParent.set(node.id, node.parentId);
			}
			const parentOf = (id) => treeParent.get(id);
			for (const node of cleaned) {
				if (node.id === rootId) continue;
				const path = /* @__PURE__ */ new Set([node.id]);
				let cursor = parentOf(node.id);
				while (cursor !== void 0) {
					if (cursor === rootId) break;
					if (path.has(cursor)) {
						treeParent.set(node.id, rootId);
						issues.push({
							code: "CYCLE",
							message: `检测到环，已把「${node.label}」挂回根`,
							id: node.id
						});
						break;
					}
					path.add(cursor);
					cursor = parentOf(cursor);
				}
			}
			for (const node of cleaned) {
				if (node.id === rootId) continue;
				if (parentOf(node.id) === void 0) {
					const wanted = node.parentId;
					if (wanted !== null && wanted !== void 0 && wanted !== "" && !seen.has(wanted)) issues.push({
						code: "PARENT_MISSING",
						message: `父节点「${wanted}」不存在，已把「${node.label}」挂回根`,
						id: node.id
					});
					treeParent.set(node.id, rootId);
				}
			}
			const childrenOf = /* @__PURE__ */ new Map();
			for (const [child, parent] of treeParent) {
				const list = childrenOf.get(parent) ?? [];
				list.push(child);
				childrenOf.set(parent, list);
			}
			const depth = /* @__PURE__ */ new Map([[rootId, 0]]);
			const queue = [rootId];
			const dropped = /* @__PURE__ */ new Set();
			const cleanedIds = new Set(cleaned.map((node) => node.id));
			for (const [child, parent] of treeParent) {
				if (parent === rootId || cleanedIds.has(parent)) continue;
				if (seen.has(parent)) {
					depth.set(child, Math.min(2, PRODUCT_GRAPH_LIMITS.depth));
					queue.push(child);
				}
			}
			while (queue.length > 0) {
				const current = queue.shift();
				const d = depth.get(current) ?? 0;
				for (const child of childrenOf.get(current) ?? []) {
					if (dropped.has(child)) continue;
					if (d + 1 > PRODUCT_GRAPH_LIMITS.depth) {
						dropped.add(child);
						issues.push({
							code: "DEPTH_LIMIT",
							message: `超过 ${PRODUCT_GRAPH_LIMITS.depth} 层，已丢弃节点`,
							id: child
						});
						continue;
					}
					depth.set(child, d + 1);
					queue.push(child);
				}
			}
			for (const node of cleaned) if (node.id !== rootId && !depth.has(node.id)) dropped.add(node.id);
			for (const node of cleaned) if (!dropped.has(node.id)) node.depth = depth.get(node.id) ?? 0;
			const kept = cleaned.filter((n) => !dropped.has(n.id));
			for (const node of kept) node.parentId = node.id === rootId ? null : treeParent.get(node.id) ?? rootId;
			const treeEdges = kept.filter((n) => n.id !== rootId).map((n) => ({
				from: n.parentId,
				to: n.id,
				kind: "tree"
			}));
			const relate = relateEdges.filter((e) => !dropped.has(e.from) && (isExternalRef(e.to) || !dropped.has(e.to)));
			return {
				graph: {
					v: 2,
					rootId,
					nodes: kept,
					edges: treeEdges.concat(relate)
				},
				issues
			};
		}
		/** v1 mindmap（{nodes:[{id,label,type,parentId}]}）→ v2 图；节点 id 原样保留。 */
		function productGraphFromV1(raw, title = "产品") {
			const issues = [];
			const source = (() => {
				if (typeof raw === "string") try {
					return JSON.parse(raw);
				} catch {
					return { nodes: [] };
				}
				if (raw !== null && typeof raw === "object") return raw;
				return { nodes: [] };
			})();
			const nodes = [];
			for (const item of asArray(source.nodes)) {
				if (item === null || typeof item !== "object") continue;
				const node = item;
				const id = clampText(node.id, 64);
				if (id === "") continue;
				const type = clampText(node.type, 16);
				const kind = type === "root" ? "root" : type === "requirement" ? "requirement" : "feature";
				nodes.push({
					id,
					label: clampText(node.label, PRODUCT_GRAPH_LIMITS.label, true) || `未命名${PRODUCT_KIND_LABEL[kind]}`,
					kind,
					detail: clampText(node.note, PRODUCT_GRAPH_LIMITS.detail, true),
					parentId: typeof node.parentId === "string" && node.parentId !== "" ? node.parentId : null,
					status: "kept"
				});
			}
			const normalized = normalizeProductGraph({
				v: 2,
				rootId: nodes.find((n) => n.kind === "root")?.id ?? nodes[0]?.id ?? "root",
				nodes,
				edges: []
			}, { title });
			return {
				graph: normalized.graph,
				issues: issues.concat(normalized.issues)
			};
		}
		function productChildrenMap(graph) {
			const map = /* @__PURE__ */ new Map();
			const byId = new Map(graph.nodes.map((n) => [n.id, n]));
			for (const edge of graph.edges) {
				if (edge.kind !== "tree") continue;
				const child = byId.get(edge.to);
				if (!child) continue;
				const list = map.get(edge.from) ?? [];
				list.push(child);
				map.set(edge.from, list);
			}
			return map;
		}
		function productNodeById(graph, id) {
			if (!id) return void 0;
			return graph.nodes.find((n) => n.id === id);
		}
		/** 版本 A/B 对比（同灵感 diffGraphs）。 */
		function diffProductGraphs(before, after) {
			const beforeMap = new Map(before.nodes.map((n) => [n.id, n]));
			const afterMap = new Map(after.nodes.map((n) => [n.id, n]));
			const added = after.nodes.filter((n) => !beforeMap.has(n.id)).map((n) => ({
				id: n.id,
				label: n.label
			}));
			const removed = before.nodes.filter((n) => !afterMap.has(n.id)).map((n) => ({
				id: n.id,
				label: n.label
			}));
			const changed = after.nodes.filter((n) => beforeMap.has(n.id)).map((n) => ({
				id: n.id,
				label: n.label,
				before: beforeMap.get(n.id)?.label ?? "",
				after: n.label
			})).filter((entry) => entry.before !== entry.after);
			const beforeEdges = new Set(before.edges.map((e) => `${e.kind}:${e.from}>${e.to}`));
			const afterEdges = new Set(after.edges.map((e) => `${e.kind}:${e.from}>${e.to}`));
			return {
				added,
				removed,
				changed,
				addedEdges: after.edges.filter((e) => !beforeEdges.has(`${e.kind}:${e.from}>${e.to}`)).length,
				removedEdges: before.edges.filter((e) => !afterEdges.has(`${e.kind}:${e.from}>${e.to}`)).length
			};
		}
		function toMindElixir(graph) {
			const children = productChildrenMap(graph);
			const build = (node, guard) => {
				const kids = (children.get(node.id) ?? []).filter((child) => !guard.has(child.id));
				const next = new Set(guard).add(node.id);
				return {
					id: node.id,
					topic: node.label,
					expanded: node.collapsed !== true,
					children: kids.map((child) => build(child, next))
				};
			};
			const root = productNodeById(graph, graph.rootId) ?? graph.nodes[0];
			if (!root) return { nodeData: {
				id: "root",
				topic: "产品",
				children: []
			} };
			return { nodeData: build(root, /* @__PURE__ */ new Set()) };
		}
		/**
		* mind-elixir 数据 → 图。只覆盖「结构 + 文案」；detail / kind / platform / status / 跨图引用按 id 从旧图继承。
		*/
		function fromMindElixir(data, prev) {
			const nodes = [];
			const edges = [];
			const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
			const walk = (raw, parentId, depth, guard) => {
				if (!raw || typeof raw.id !== "string" || guard.has(raw.id)) return;
				guard.add(raw.id);
				const old = prevById.get(raw.id);
				const node = {
					id: raw.id,
					label: String(raw.topic ?? "").slice(0, PRODUCT_GRAPH_LIMITS.label) || "未命名",
					kind: old?.kind ?? (depth === 0 ? "root" : "feature"),
					detail: old?.detail ?? "",
					depth,
					parentId,
					platform: old?.platform,
					status: old?.status ?? "kept",
					tags: old?.tags,
					collapsed: raw.expanded === false ? true : void 0
				};
				nodes.push(node);
				if (parentId !== null) edges.push({
					from: parentId,
					to: raw.id,
					kind: "tree"
				});
				for (const child of raw.children ?? []) walk(child, raw.id, depth + 1, guard);
			};
			walk(data.nodeData, null, 0, /* @__PURE__ */ new Set());
			const rootId = data.nodeData?.id ?? nodes[0]?.id ?? "root";
			const alive = new Set(nodes.map((n) => n.id));
			for (const edge of prev.edges) {
				if (edge.kind !== "relate") continue;
				if (isExternalRef(edge.to)) {
					if (alive.has(edge.from)) edges.push({ ...edge });
					continue;
				}
				if (alive.has(edge.from) && alive.has(edge.to)) edges.push({ ...edge });
			}
			return {
				v: 2,
				rootId,
				nodes,
				edges
			};
		}
		/** 关系力导图：按 kind 分类配色、虚线 relate、跨图引用画成外部节点、悬停邻接高亮。 */
		function buildProductForceOption(graph, opts = {}) {
			const dark = opts.dark === true;
			const categories = [...new Set(graph.nodes.map((n) => n.kind))].map((kind) => ({
				name: PRODUCT_KIND_LABEL[kind],
				itemStyle: { color: PRODUCT_KIND_COLOR[kind] }
			}));
			const catIndex = new Map(categories.map((c, i) => [c.name, i]));
			const data = graph.nodes.map((node) => ({
				id: node.id,
				name: node.label,
				category: catIndex.get(PRODUCT_KIND_LABEL[node.kind]) ?? 0,
				symbolSize: node.kind === "root" ? 52 : node.kind === "module" ? 34 : node.kind === "business" ? 26 : 16,
				label: {
					show: node.kind !== "feature" || graph.nodes.length <= 60,
					fontSize: node.kind === "root" ? 12 : node.kind === "module" || node.kind === "business" ? 11 : 10,
					fontWeight: node.kind === "root" ? 700 : node.kind === "feature" ? 400 : 600,
					color: dark ? "#ecedf1" : "#1a1a1f",
					position: node.kind === "feature" || node.kind === "requirement" ? "bottom" : "inside"
				},
				itemStyle: node.kind === "root" ? {
					color: dark ? "#8b87ff" : "#5b5bd6",
					borderColor: dark ? "#b3b0ff" : "#4a4ac2",
					borderWidth: 1
				} : node.kind === "module" || node.kind === "business" ? {
					color: PRODUCT_KIND_COLOR[node.kind],
					opacity: .92,
					borderColor: dark ? "#111113" : "#fff",
					borderWidth: 2
				} : {
					color: node.status === "dropped" ? dark ? "#2a2a30" : "#f1f1f4" : dark ? "#19191d" : "#fff",
					borderColor: PRODUCT_KIND_COLOR[node.kind],
					borderWidth: 1.5,
					opacity: node.status === "dropped" ? .5 : 1
				},
				value: node.detail ?? ""
			}));
			const links = [];
			for (const edge of graph.edges) {
				if (edge.kind === "relate" && isExternalRef(edge.to)) {
					const ref = parseExternalRef(edge.to);
					if (ref === null) continue;
					data.push({
						id: edge.to,
						name: `↗ ${ref.nodeId}`,
						category: 0,
						symbolSize: 12,
						symbol: "diamond",
						label: {
							show: true,
							fontSize: 9,
							color: dark ? "#a3a3b0" : "#8f8f9c",
							formatter: `跨图 → ${ref.mapId.slice(0, 8)}`
						},
						itemStyle: { color: dark ? "#4a4a56" : "#b9b9c6" }
					});
					links.push({
						source: edge.from,
						target: edge.to,
						label: {
							show: Boolean(edge.label),
							formatter: edge.label ?? "",
							fontSize: 9,
							color: dark ? "#a3a3b0" : "#8f8f9c"
						},
						lineStyle: {
							type: "dashed",
							color: dark ? "#6b6b7c" : "#8f8f9c",
							width: 1.4,
							curveness: .25
						}
					});
					continue;
				}
				links.push({
					source: edge.from,
					target: edge.to,
					label: edge.kind === "relate" ? {
						show: Boolean(edge.label),
						formatter: edge.label ?? "",
						fontSize: 9,
						color: dark ? "#a3a3b0" : "#8f8f9c"
					} : { show: false },
					lineStyle: edge.kind === "relate" ? {
						type: "dashed",
						color: dark ? "#4a4a56" : "#b9b9c6",
						width: 1.2,
						curveness: .18
					} : {
						color: dark ? "#33333d" : "#e0e0e8",
						width: 1.4,
						curveness: 0
					}
				});
			}
			return {
				backgroundColor: dark ? "#19191d" : "#ffffff",
				tooltip: {
					show: true,
					formatter: (params) => {
						if (params?.dataType !== "node") return "";
						const node = graph.nodes.find((n) => n.id === params.data.id);
						if (node === void 0) return String(params.data.name ?? "");
						return `<b>${escapeHtml(node.label)}</b> · ${PRODUCT_KIND_LABEL[node.kind]}${node.detail ? `<br>${escapeHtml(node.detail)}` : ""}`;
					}
				},
				series: [{
					type: "graph",
					layout: "force",
					roam: true,
					draggable: true,
					focusNodeAdjacency: true,
					emphasis: {
						focus: "adjacency",
						lineStyle: { width: 2.4 }
					},
					force: {
						repulsion: 320,
						edgeLength: [70, 150],
						gravity: .06,
						friction: .2,
						layoutAnimation: true
					},
					categories,
					data,
					links,
					labelLayout: { hideOverlap: true },
					edgeSymbol: ["none", "none"],
					selectedMode: "single"
				}]
			};
		}
		function escapeHtml(value) {
			return String(value).replace(/[&<>"']/g, (ch) => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&quot;",
				"'": "&#39;"
			})[ch] ?? ch);
		}
		/** 导出大纲：层级用缩进，kind 用（模块）（业务）（需求）标记（功能不标记）。 */
		function productGraphToMarkdown(graph) {
			const children = productChildrenMap(graph);
			const root = productNodeById(graph, graph.rootId);
			const lines = [];
			const mark = (node) => node.kind === "requirement" ? "（需求）" : node.kind === "module" ? "（模块）" : node.kind === "business" ? "（业务）" : "";
			const walk = (node, depth, guard) => {
				if (guard.has(node.id)) return;
				guard.add(node.id);
				const bullet = depth === 0 ? `# ${node.label}` : `${"  ".repeat(depth)}- ${node.label}${mark(node)}`;
				lines.push(bullet + (node.detail && depth > 0 ? ` —— ${node.detail}` : ""));
				for (const child of children.get(node.id) ?? []) walk(child, depth + 1, guard);
			};
			if (root) walk(root, 0, /* @__PURE__ */ new Set());
			const relates = graph.edges.filter((e) => e.kind === "relate");
			if (relates.length > 0) {
				lines.push("", "## 关联");
				for (const edge of relates) {
					const from = productNodeById(graph, edge.from)?.label ?? edge.from;
					const to = productNodeById(graph, edge.to)?.label ?? edge.to;
					lines.push(`- ${from} ↔ ${to}${edge.label ? `（${edge.label}）` : ""}`);
				}
			}
			return lines.join("\n");
		}
		/** Markdown 大纲 → 图（缩进或 - 层级；（需求）（模块）（业务）标记定 kind；首行 # 标题即根）。 */
		function parseOutlineToProductGraph(raw, title) {
			const rows = raw.split("\n").map((line) => line.replace(/\t/g, "  "));
			const parsed = [];
			let rootLabel = "";
			for (const line of rows) {
				if (/^\s*##\s*关联\s*$/.test(line)) break;
				const match = line.match(/^(\s*)(?:[-*+]\s+|#{1,6}\s+)?(.*)$/);
				if (!match) continue;
				const labelRaw = match[2].trim();
				if (labelRaw === "" || labelRaw.includes("↔")) continue;
				const indent = match[1].replace(/\t/g, "  ").length;
				const depth = Math.floor(indent / 2);
				if (rootLabel === "" && depth === 0 && /^\s*#{1,6}\s+/.test(line)) {
					rootLabel = labelRaw;
					continue;
				}
				const kind = /（需求）|\(需求\)|\[需求\]/.test(labelRaw) ? "requirement" : /（模块）|\(模块\)/.test(labelRaw) ? "module" : /（业务）|\(业务\)/.test(labelRaw) ? "business" : "feature";
				const label = labelRaw.replace(/（需求）|\(需求\)|\[需求\]|（模块）|\(模块\)|（业务）|\(业务\)/g, "").split(" —— ")[0].trim();
				parsed.push({
					depth,
					label,
					kind
				});
			}
			const name = rootLabel !== "" ? rootLabel : title;
			const fallback = emptyProductGraph(name);
			if (parsed.length === 0) return {
				graph: rootLabel === "" ? fallback : {
					...fallback,
					nodes: [{
						...fallback.nodes[0],
						label: clampText(rootLabel, PRODUCT_GRAPH_LIMITS.label, true) || fallback.nodes[0].label
					}]
				},
				issues: rootLabel === "" ? [{
					code: "OUTLINE_EMPTY",
					message: "没有解析到大纲内容"
				}] : []
			};
			const rootId = "root";
			const nodes = [{
				id: rootId,
				label: name,
				kind: "root",
				parentId: null,
				depth: 0,
				status: "kept"
			}];
			const stack = [{
				id: rootId,
				depth: -1
			}];
			let index = 0;
			for (const row of parsed) {
				while (stack.length > 1 && stack[stack.length - 1].depth >= row.depth) stack.pop();
				const parent = stack[stack.length - 1];
				index += 1;
				const id = `pn-${index.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
				nodes.push({
					id,
					label: row.label,
					kind: row.kind,
					parentId: parent.id,
					status: "kept"
				});
				stack.push({
					id,
					depth: row.depth
				});
			}
			return normalizeProductGraph({
				v: 2,
				rootId,
				nodes,
				edges: []
			}, { title: name });
		}
		/**
		* 灵感图 → 产品导图（整图或某节点子树）：
		* seed→root（标题取产品名）、direction→module、idea→feature、
		* question→requirement(pending)、risk→requirement(tags 含「风险」)；detail/angle/status/tags 原样带走（angle 变 angle:xxx 标签）。
		*/
		function productGraphFromIdea(idea, opts = {}) {
			const title = clampText(opts.title, PRODUCT_GRAPH_LIMITS.label) || "产品";
			const byId = new Map(idea.nodes.map((n) => [n.id, n]));
			const children = /* @__PURE__ */ new Map();
			for (const edge of idea.edges) {
				if (edge.kind !== "tree") continue;
				const child = byId.get(edge.to);
				const parent = byId.get(edge.from);
				if (!child || !parent) continue;
				const list = children.get(parent.id) ?? [];
				list.push(child);
				children.set(parent.id, list);
			}
			const scope = /* @__PURE__ */ new Set();
			const collect = (id, guard) => {
				if (guard.has(id)) return;
				guard.add(id);
				scope.add(id);
				for (const kid of children.get(id) ?? []) collect(kid.id, guard);
			};
			const branchId = opts.branchNodeId !== void 0 && opts.branchNodeId !== "" && byId.has(opts.branchNodeId) ? opts.branchNodeId : idea.rootId;
			collect(branchId, /* @__PURE__ */ new Set());
			const mapKind = (node, depth) => {
				if (node.type === "seed") return depth === 0 ? "root" : opts.defaultKind ?? "module";
				if (node.type === "direction") return opts.defaultKind ?? "module";
				if (node.type === "question") return "requirement";
				if (node.type === "risk") return "requirement";
				return "feature";
			};
			const nodes = [];
			const isWhole = branchId === idea.rootId;
			const root = {
				id: "root",
				label: title,
				kind: "root",
				detail: "",
				parentId: null,
				depth: 0,
				status: "kept"
			};
			nodes.push(root);
			const idMap = /* @__PURE__ */ new Map();
			const walk = (node, parentId, depth, guard) => {
				if (!scope.has(node.id) || guard.has(node.id)) return;
				guard.add(node.id);
				const kind = mapKind(node, depth);
				const targetId = node.id === branchId && isWhole && node.type === "seed" ? "root" : node.id;
				idMap.set(node.id, targetId);
				const tags = [...Array.isArray(node.tags) ? node.tags : []];
				if (node.angle) tags.push(`angle:${node.angle}`);
				if (node.type === "risk") tags.push("风险");
				const entry = {
					id: targetId,
					label: clampText(node.label, PRODUCT_GRAPH_LIMITS.label, true) || `未命名${PRODUCT_KIND_LABEL[kind]}`,
					kind: targetId === "root" ? "root" : kind,
					detail: clampText(node.detail, PRODUCT_GRAPH_LIMITS.detail, true),
					parentId: targetId === "root" ? null : parentId,
					status: node.status === "dropped" ? "dropped" : node.status === "pending" || node.status === void 0 && node.type === "question" ? "pending" : "kept",
					tags: tags.length > 0 ? tags.slice(0, PRODUCT_GRAPH_LIMITS.tags) : void 0
				};
				if (targetId !== "root") nodes.push(entry);
				else nodes[0] = {
					...nodes[0],
					detail: entry.detail,
					tags: entry.tags
				};
				for (const kid of children.get(node.id) ?? []) walk(kid, targetId, depth + 1, guard);
			};
			const startNode = byId.get(branchId);
			if (startNode !== void 0) {
				if (isWhole) walk(startNode, "root", 0, /* @__PURE__ */ new Set());
				else walk(startNode, "root", 1, /* @__PURE__ */ new Set());
			}
			const edges = [];
			const alive = new Set(nodes.map((n) => n.id));
			for (const edge of idea.edges) if (edge.kind === "relate") {
				const from = idMap.get(edge.from);
				const to = idMap.get(edge.to);
				if (from !== void 0 && to !== void 0 && alive.has(from) && alive.has(to) && from !== to) edges.push({
					from,
					to,
					kind: "relate",
					label: clampText(edge.label, PRODUCT_GRAPH_LIMITS.label, true) || void 0
				});
			}
			return normalizeProductGraph({
				v: 2,
				rootId: "root",
				nodes,
				edges
			}, { title });
		}
		// src/client/app.ts
		/**
		* 工作台主体（Shadow DOM 内的原生渲染层）。
		*
		* 之所以不用 JSX：这套界面来自可点击原型（同一份 CSS/结构），直接搬进 Shadow DOM
		* 能保证视觉一致，同时把 DOM 事件、定时器、数据同步全部收在一个可控的 mount 里；
		* 外层的 React 只负责挂载/卸载。
		*/
		const API = "/workbench-api";
		const STATUS_LABEL = {
			next: "下一步",
			doing: "进行中",
			waiting: "等待中",
			done: "已完成"
		};
		const STATUS_COLOR = {
			next: "#8a8a94",
			doing: "#0f9f6e",
			waiting: "#c27c0e",
			done: "#9a9aa4"
		};
		const PRIORITY_LABEL = {
			high: "高优先级",
			normal: "普通",
			low: "低优先级"
		};
		const ACCENTS = [
			"#d97706",
			"#0f9f6e",
			"#2563eb",
			"#7c3aed",
			"#db2777",
			"#0891b2"
		];
		/** 侧栏宽度：拖动范围与默认值（窄面板跟随旧的 190 布局）。 */
		const SIDE_MIN = 156;
		const SIDE_MAX = 420;
		const SIDE_DEFAULT = 200;
		const SIDE_DEFAULT_NARROW = 190;
		/**
		* 门户功能区按业务分组：每个分组整行铺满，组内卡片由 grid auto-fill 自适应宽度。
		* 改分组只改这里，渲染与样式不必跟着动。
		*/
		const PORTAL_GROUPS = [{
			id: "work",
			title: "工作",
			hint: "任务、日程与沉淀",
			views: [
				"list",
				"board",
				"calendar",
				"stats",
				"focus",
				"notes",
				"news"
			]
		}, {
			id: "rd",
			title: "研发",
			hint: "产品设计、缺陷、测试与灵感",
			views: [
				"product",
				"bugs",
				"test",
				"idea"
			]
		}];
		function pad(n) {
			return String(n).padStart(2, "0");
		}
		function dateKey(d) {
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}
		function todayKey() {
			return dateKey(/* @__PURE__ */ new Date());
		}
		function parseDate(s) {
			const [y, m, d] = s.split("-").map(Number);
			return new Date(y || 1970, (m || 1) - 1, d || 1);
		}
		function addDays(s, delta) {
			const d = parseDate(s);
			d.setDate(d.getDate() + delta);
			return dateKey(d);
		}
		function fmtDay(s) {
			const d = parseDate(s);
			return `${d.getMonth() + 1}月${d.getDate()}日`;
		}
		function weekdayName(s) {
			return [
				"周日",
				"周一",
				"周二",
				"周三",
				"周四",
				"周五",
				"周六"
			][parseDate(s).getDay()] ?? "";
		}
		function startOfWeek(s) {
			const d = parseDate(s);
			d.setDate(d.getDate() - d.getDay());
			return dateKey(d);
		}
		function startOfMonth(s) {
			const d = parseDate(s);
			return dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
		}
		function addMonths(s, delta) {
			const d = parseDate(s);
			d.setDate(1);
			d.setMonth(d.getMonth() + delta);
			return dateKey(d);
		}
		function nowStamp() {
			const d = /* @__PURE__ */ new Date();
			return `${todayKey()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
		function isoWeekStart() {
			return startOfWeek(todayKey());
		}
		function inRange(date, start, end) {
			return date !== null && date >= start && date <= end;
		}
		function timeText(t) {
			return t.start && t.end ? `${t.start}–${t.end}` : t.start || "未安排";
		}
		function uid(prefix) {
			return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
		}
		function esc(s) {
			return String(s).replace(/[&<>"]/g, (c) => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&quot;"
			})[c] ?? c);
		}
		const PATHS = {
			logo: "<rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"2\"/><path d=\"M14 17h6M17 14v6\"/>",
			panel: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 4v16\"/>",
			home: "<path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V21h14V9.5\"/>",
			inbox: "<path d=\"M4 5h16v14H4z\"/><path d=\"M4 13h4l2 3h4l2-3h4\"/>",
			list: "<path d=\"M8 6h13M8 12h13M8 18h13\"/><path d=\"M3.5 6h.01M3.5 12h.01M3.5 18h.01\"/>",
			board: "<rect x=\"3\" y=\"4\" width=\"7\" height=\"16\" rx=\"1.5\"/><rect x=\"14\" y=\"4\" width=\"7\" height=\"10\" rx=\"1.5\"/>",
			grid: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
			calendar: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>",
			news: "<path d=\"M4 5h13v14H5a1 1 0 0 1-1-1z\"/><path d=\"M17 8h3v9a2 2 0 0 1-2 2H5\"/><path d=\"M7 8h7M7 11h7M7 14h4\"/>",
			notebook: "<path d=\"M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z\"/><path d=\"M8 7h8M8 11h8M8 15h5\"/>",
			bug: "<rect x=\"7\" y=\"7\" width=\"10\" height=\"12\" rx=\"5\"/><path d=\"M12 3v4M5 11H3M21 11h-2M5 17H3M21 17h-2M8 6 6 4M16 6l2-2M8 18l-2 2M16 18l2 2\"/>",
			product: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 8h4M7 12h7M7 16h5\"/><circle cx=\"17\" cy=\"8\" r=\"2\"/>",
			test: "<path d=\"M9 4h6M9 4a2 2 0 0 0-2 2v1h10V6a2 2 0 0 0-2-2\"/><rect x=\"5\" y=\"7\" width=\"14\" height=\"14\" rx=\"2\"/><path d=\"m9 13 2 2 4-4\"/>",
			pin: "<path d=\"M9 4h6l-1 5 4 3v2H6v-2l4-3-1-5Z\"/><path d=\"M12 14v7\"/>",
			download: "<path d=\"M12 3v12\"/><path d=\"m7 11 5 5 5-5\"/><path d=\"M5 21h14\"/>",
			pdf: "<path d=\"M6 2h8l4 4v16H6z\"/><path d=\"M14 2v5h5\"/><path d=\"M9 13h6M9 17h4\"/>",
			external: "<path d=\"M14 4h6v6\"/><path d=\"M20 4 10 14\"/><path d=\"M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5\"/>",
			clock: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>",
			chart: "<path d=\"M4 20V10M10 20V4M16 20v-7M22 20H2\"/>",
			settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.14.36.44.65.8.8H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z\"/>",
			search: "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m20 20-4.5-4.5\"/>",
			bell: "<path d=\"M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9\"/><path d=\"M10.5 21h3\"/>",
			sun: "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
			moon: "<path d=\"M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z\"/>",
			plus: "<path d=\"M12 5v14M5 12h14\"/>",
			check: "<path d=\"m5 12 4 4L19 6\"/>",
			play: "<path d=\"M7 4.5v15l12-7.5z\"/>",
			upload: "<path d=\"M12 21V9\"/><path d=\"m7 13 5-5 5 5\"/><path d=\"M5 3h14\"/>",
			pause: "<path d=\"M8 5v14M16 5v14\"/>",
			rotate: "<path d=\"M3 12a9 9 0 1 0 2.6-6.4\"/><path d=\"M3 4v4h4\"/>",
			refresh: "<path d=\"M20 11a8 8 0 0 0-14-4.5L4 8\"/><path d=\"M4 4v4h4\"/><path d=\"M4 13a8 8 0 0 0 14 4.5L20 16\"/><path d=\"M20 20v-4h-4\"/>",
			edit: "<path d=\"M4 20h4L20 8l-4-4L4 16z\"/><path d=\"m13.5 6.5 4 4\"/>",
			copy: "<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15V5a2 2 0 0 1 2-2h8\"/>",
			trash: "<path d=\"M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14\"/>",
			flag: "<path d=\"M5 21V4c4-2 8 2 12 0v9c-4 2-8-2-12 0\"/>",
			tag: "<path d=\"M3 11V4h7l10 10-6 6L3 11z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\"1\"/>",
			folder: "<path d=\"M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
			note: "<path d=\"M5 3h9l5 5v13H5z\"/><path d=\"M14 3v5h5M8 13h8M8 17h5\"/>",
			chevR: "<path d=\"m9 5 7 7-7 7\"/>",
			chevL: "<path d=\"m15 5-7 7 7 7\"/>",
			chevD: "<path d=\"m5 9 7 7 7-7\"/>",
			filter: "<path d=\"M3 5h18l-7 8v6l-4 2v-8z\"/>",
			sort: "<path d=\"M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3\"/>",
			target: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"4.5\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
			layers: "<path d=\"m12 3 9 5-9 5-9-5z\"/><path d=\"m3 13 9 5 9-5\"/><path d=\"m3 17 9 5 9-5\"/>",
			spark: "<path d=\"M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8\"/>",
			link: "<path d=\"M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1\"/><path d=\"M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1\"/>",
			paperclip: "<path d=\"m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7\"/>",
			image: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"8.5\" cy=\"9.5\" r=\"1.5\"/><path d=\"m21 16-5-5-9 9\"/>",
			arrowR: "<path d=\"M4 12h15M13 6l6 6-6 6\"/>",
			checkSquare: "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"3\"/><path d=\"m8 12 2.5 2.5L16 9\"/>",
			playSmall: "<path d=\"M8 5v14l11-7z\"/>",
			expand: "<path d=\"M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7\"/>",
			corner: "<path d=\"M6 3v8a4 4 0 0 0 4 4h8\"/><path d=\"m15 12 3 3-3 3\"/>",
			x: "<path d=\"M6 6l12 12M18 6 6 18\"/>"
		};
		function ic(name, size = 16) {
			return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
		}
		function mountWorkbench(hostEl, dshCtx) {
			const shadow = hostEl.attachShadow({ mode: "open" });
			hostEl.style.display = "block";
			hostEl.style.height = "100%";
			hostEl.style.minHeight = "0";
			shadow.innerHTML = `<style>${WORKBENCH_CSS}</style>${SHELL}`;
			const $id = (id) => shadow.getElementById(id);
			const agentPanel = createAgentPanel({
				api: API,
				esc,
				ic,
				toast: (message) => toast(message),
				confirm: (message) => typeof window.confirm === "function" ? window.confirm(message) : true,
				openModal: (html) => openModal(html),
				closeModal: () => closeModal(),
				q: $id
			});
			agentPanel.onRefresh(() => renderAll());
			const content = () => $id("wb-content");
			const detail = () => $id("wb-detail");
			let db = {
				spaces: [],
				tasks: [],
				focus: [],
				settings: {}
			};
			let revision = 0;
			let loaded = false;
			let loadError = "";
			let saveTimer = 0;
			let saveState = "saved";
			let conflictReloading = false;
			let dirty = false;
			/** 侧栏当前宽度（像素）；持久化在 settings.sideWidth。 */
			let sideWidth = SIDE_DEFAULT;
			/**
			* 应用侧栏宽度：写到 .app 的 --wb-side-w 上，由 CSS 驱动侧栏宽度。
			* persist 为真时写回 settings.sideWidth（一次拖动只在松手时落库一次）。
			*/
			function applySideWidth(px, persist) {
				const next = Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(Number.isFinite(px) ? px : SIDE_DEFAULT)));
				sideWidth = next;
				const app = $id("wb-app");
				if (app !== null) app.style.setProperty("--wb-side-w", `${next}px`);
				if (persist) {
					db.settings.sideWidth = next;
					scheduleSave();
				}
			}
			/** 首次进入：优先用保存过的宽度，否则按面板宽度给默认值。 */
			function initSideWidth() {
				const saved = typeof db.settings.sideWidth === "number" ? db.settings.sideWidth : void 0;
				const fallback = window.matchMedia("(max-width:1250px)").matches ? SIDE_DEFAULT_NARROW : SIDE_DEFAULT;
				applySideWidth(saved ?? fallback, false);
			}
			let newsTopics = [];
			let newsItems = [];
			let cronTasks = [];
			let cronAvailable = true;
			let newsWatchUntil = 0;
			let lastNewsPoll = 0;
			let newsSig = "";
			const newsRunning = {};
			let collapseTouched = false;
			let bugProjects = [];
			let bugs = [];
			let bugProjectFilter = "all";
			let bugSearch = "";
			let bugSelected = /* @__PURE__ */ new Set();
			let bugLoading = false;
			let bugError = "";
			let bugsSig = "";
			let products = [];
			let productDemos = [];
			let productModules = [];
			let productSelected = null;
			/** 当前产品下的导图清单与选中导图；'' 表示「全部导图」聚合视图。 */
			let productMaps = [];
			let productMapSelected = "";
			/** 其他页签是否聚合「全部导图」（地图页签永远只看选中导图）。 */
			let productMapScopeAll = false;
			/** 宿主是否提供多导图接口（旧宿主 404 时退回单导图 + products.mindmap）。 */
			let productMapsReady = false;
			let productTab = "map";
			let productNodeSelected = null;
			/** 画布引擎：mind-elixir（编辑）/ ECharts 力导（关系）。 */
			let productMapEngine = "tree";
			/** 当前导图的版本序列（参照灵感：存档 / 对比 / 回滚 / 只读预览）。 */
			let productMapVersions = [];
			let productMapPreview = null;
			let productMind = null;
			let productChart = null;
			let productMindLoading = null;
			let productMindSyncTimer = 0;
			/** 草稿保存串行链：并发提交同一 rev 会假 409 并回写覆盖，排队后后者带上前者返回的 rev。 */
			let productPersistChain = Promise.resolve();
			let ctxMenuOpen = false;
			let productPicked = /* @__PURE__ */ new Set();
			let productStyle = "clean";
			let productPlatform = "all";
			let productDemoKind = "page";
			let demoViewport = "pc";
			let demoProgress = null;
			let demoProgressDismissedAt = "";
			let productLoading = false;
			let productError = "";
			let productSig = "";
			let productDemoSelected = "";
			let testProjects = [];
			let testCases = [];
			let testRuns = [];
			let testProjectSelected = null;
			let testTab = "cases";
			let testRunSelected = null;
			let testLoading = false;
			let testError = "";
			let testSig = "";
			let testDeployLog = "";
			let testGenSource = "requirement";
			let testGenRequirement = "";
			let notes = [];
			let notebooks = [];
			let noteNotebookFilter = "all";
			let noteSelected = null;
			let exportDir = "";
			let defaultExportDir = "";
			let lastExportPath = "";
			let noteExporting = false;
			let noteLoading = false;
			let noteError = "";
			let noteDirty = false;
			let noteChangeSeq = 0;
			let noteSaveTimer = 0;
			let noteSaveState = "saved";
			const ui = {
				view: "portal",
				project: "all",
				scope: "today",
				space: "all",
				q: "",
				selected: null,
				detailTab: "detail",
				collapsed: hostEl.clientWidth > 0 ? hostEl.clientWidth < 1250 : window.innerWidth < 1450,
				calendarMode: "week",
				calendarAnchor: todayKey(),
				filter: "all",
				sort: "time",
				compact: false,
				queueQ: "",
				statsPeriod: "week",
				focusExpand: false,
				subNoteId: null,
				newsTopicFilter: "all",
				newsLoading: false,
				newsError: "",
				notesQ: "",
				notesFilter: "all",
				noteMode: "edit"
			};
			const timer = {
				preset: 25,
				running: false,
				remaining: 1500,
				endsAt: 0,
				taskId: null
			};
			const spaceOf = (id) => db.spaces.find((s) => s.id === id) ?? {
				id,
				name: id || "未分组",
				color: "#8a8a94"
			};
			const taskOf = (id) => db.tasks.find((t) => t.id === id);
			const selectedTask = () => taskOf(ui.selected);
			const pool = () => ui.scope === "all" ? db.tasks : db.tasks.filter((t) => t.date === todayKey() || t.status === "doing" && t.date === null);
			const matchQ = (t) => {
				const q = ui.q.trim().toLowerCase();
				if (q === "") return true;
				return `${t.title} ${t.desc} ${t.note} ${spaceOf(t.space).name}`.toLowerCase().includes(q);
			};
			const matchSpace = (t) => ui.space === "all" || t.space === ui.space;
			const matchFilter = (t) => {
				switch (ui.filter) {
					case "high": return t.priority === "high";
					case "sub": return t.subtasks.length > 0;
					case "attach": return t.attachments.length > 0;
					case "unscheduled": return !t.start;
					default: return true;
				}
			};
			const visible = (t) => matchQ(t) && matchSpace(t) && matchFilter(t) && matchProject(t);
			const sortTasks = (items, mode = ui.sort) => {
				const copy = items.slice();
				if (mode === "priority") {
					const rank = {
						high: 0,
						normal: 1,
						low: 2
					};
					copy.sort((a, b) => rank[a.priority] - rank[b.priority] || (a.start || "99:99").localeCompare(b.start || "99:99"));
				} else if (mode === "created") copy.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
				else if (mode === "title") copy.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
				else copy.sort((a, b) => `${a.date ?? "9999"} ${a.start || "99:99"}`.localeCompare(`${b.date ?? "9999"} ${b.start || "99:99"}`));
				return copy;
			};
			const todayStats = () => {
				const list = db.tasks.filter((t) => t.date === todayKey() && matchProject(t));
				return {
					done: list.filter((t) => t.status === "done").length,
					total: list.length,
					pending: list.filter((t) => t.status !== "done").length
				};
			};
			const todayFocus = () => {
				const list = db.focus.filter((f) => f.startedAt.slice(0, 10) === todayKey() && f.completed);
				return {
					minutes: list.reduce((sum, f) => sum + f.minutes, 0),
					rounds: list.length
				};
			};
			const doneOf = (t) => t.status === "done";
			const doneAt = (t) => (t.completedAt ?? "").slice(0, 10) || (t.date ?? "");
			function projectCards() {
				const map = /* @__PURE__ */ new Map();
				const ensure = (path) => {
					const found = map.get(path);
					if (found !== void 0) return found;
					const card = {
						path,
						name: "",
						tests: []
					};
					map.set(path, card);
					return card;
				};
				for (const product of products) {
					if (!product.workspacePath) continue;
					const card = ensure(product.workspacePath);
					card.product = product;
					if (card.name === "") card.name = product.name;
				}
				for (const project of bugProjects) {
					if (!project.workspacePath) continue;
					const card = ensure(project.workspacePath);
					card.bugProject = project;
					if (card.name === "") card.name = project.name;
				}
				for (const project of testProjects) {
					if (!project.workspacePath) continue;
					const card = ensure(project.workspacePath);
					card.tests.push(project);
					if (card.name === "") card.name = project.name;
				}
				for (const task of db.tasks) if (task.projectPath) ensure(task.projectPath);
				const cards = [];
				for (const card of map.values()) cards.push({
					...card,
					name: card.name || bugWorkspaceName(card.path)
				});
				return cards.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
			}
			function projectByPath(path) {
				return projectCards().find((card) => card.path === path);
			}
			function projectLabel(path) {
				if (path === "all") return "全部项目";
				if (path === "none" || path === "") return "未归属";
				return projectByPath(path)?.name ?? bugWorkspaceName(path);
			}
			function projectLabelOfTask(task) {
				return task.projectPath ? projectLabel(task.projectPath) : "未归属";
			}
			const matchProject = (t) => {
				if (ui.project === "all") return true;
				if (ui.project === "none") return t.projectPath === "";
				return t.projectPath === ui.project;
			};
			function projectTaskCount(path) {
				return path === "none" ? db.tasks.filter((t) => t.projectPath === "").length : db.tasks.filter((t) => t.projectPath === path).length;
			}
			function projectBugCount(path) {
				return path === "none" ? 0 : bugs.filter((bug) => bugProjectOf(bug.projectId)?.workspacePath === path).length;
			}
			function projectTestCount(path) {
				return path === "none" ? 0 : testProjects.filter((project) => project.workspacePath === path).length;
			}
			function projectNoteCount(path) {
				if (path === "none") return 0;
				const ids = new Set(notebooks.filter((book) => book.workspacePath === path).map((book) => book.id));
				return notes.filter((note) => ids.has(note.notebookId)).length;
			}
			/** 切换项目范围：同时把产品 / Bug / 测试三个域的当前选择切到该项目，门户点卡片即完成对齐。 */
			function setProject(path, render = true) {
				ui.project = path;
				const card = projectByPath(path);
				if (card?.product !== void 0) {
					productSelected = card.product.id;
					productPicked = productDefaultPicked(card.product);
				}
				if (card?.bugProject !== void 0) bugProjectFilter = card.bugProject.id;
				const targetTest = card?.tests[0];
				if (targetTest !== void 0) testProjectSelected = targetTest.id;
				db.settings.project = path === "none" ? "" : path;
				scheduleSave();
				if (render) renderAll();
			}
			/** 会话内恢复上次选中的项目（产品列表加载完成后再调用，避免误判为失效）。 */
			function restoreProject() {
				const saved = db.settings.project;
				if (typeof saved !== "string") return;
				const next = saved === "" ? "none" : saved;
				if (next === "all" || next === "none" || projectByPath(next) !== void 0) ui.project = next;
			}
			function projectSelect() {
				const cards = projectCards();
				return `<select id="wb-project" class="wb-project-select" title="按项目筛选">${[
					`<option value="all" ${ui.project === "all" ? "selected" : ""}>全部项目</option>`,
					...cards.map((card) => `<option value="${esc(card.path)}" ${ui.project === card.path ? "selected" : ""}>${esc(card.name)}</option>`),
					`<option value="none" ${ui.project === "none" ? "selected" : ""}>未归属</option>`
				].join("")}</select>`;
			}
			async function refreshPortal() {
				await Promise.all([
					loadProducts(true),
					loadBugs(true),
					loadTests(true)
				]);
				restoreProject();
				if (ui.view === "portal" || ui.view === "bugs" || ui.view === "test") renderAll();
			}
			function openFeature(view) {
				const card = projectByPath(ui.project);
				if (view === "product" && card?.product !== void 0) productSelected = card.product.id;
				if (view === "test" && card?.tests[0] !== void 0) testProjectSelected = card.tests[0].id;
				if (view === "bugs") bugProjectFilter = card?.bugProject?.id ?? "all";
				if (view === "notes") noteNotebookFilter = (card?.product !== void 0 ? notebooks.find((b) => b.id === card.product?.notebookId) : void 0)?.id ?? "all";
				if (ui.view === "notes" && view !== "notes") flushNoteSave();
				ui.view = view;
				renderAll();
				if (view === "news") loadNews();
				if (view === "notes") loadNotes();
				if (view === "bugs" && bugs.length === 0) loadBugs();
				if (view === "product" && products.length === 0) loadProducts();
				if (view === "test" && testProjects.length === 0) loadTests();
			}
			function openPortal() {
				ui.view = "portal";
				renderAll();
				refreshPortal();
			}
			function resolvedTheme() {
				const pref = db.settings.theme ?? "auto";
				if (pref === "light" || pref === "dark") return pref;
				const body = document.body;
				const html = document.documentElement;
				return body.hasAttribute("data-ds-dark-theme") || html.getAttribute("data-theme") === "dark" || body.getAttribute("data-theme") === "dark" ? "dark" : "light";
			}
			function applyTheme() {
				const pref = db.settings.theme ?? "auto";
				if (pref === "light" || pref === "dark") hostEl.setAttribute("data-wb-theme", pref);
				else hostEl.removeAttribute("data-wb-theme");
				hostEl.setAttribute("data-wb-scheme", resolvedTheme());
			}
			function setSaveState(next) {
				saveState = next;
				const node = $id("save-dot");
				const wrap = node?.parentElement;
				if (node && wrap) {
					wrap.classList.toggle("err", next === "error");
					wrap.classList.toggle("busy", next === "saving");
					wrap.innerHTML = `<i id="save-dot"></i>${next === "saved" ? "已自动保存" : next === "saving" ? "保存中…" : "保存失败"}`;
				}
			}
			function scheduleSave() {
				dirty = true;
				setSaveState("saving");
				if (saveTimer !== 0) window.clearTimeout(saveTimer);
				saveTimer = window.setTimeout(() => {
					flush();
				}, 450);
			}
			async function flush() {
				if (saveTimer !== 0) {
					window.clearTimeout(saveTimer);
					saveTimer = 0;
				}
				if (!loaded || conflictReloading || !dirty) return;
				try {
					const res = await fetch(`${API}/state`, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							revision,
							state: db
						}),
						keepalive: true
					});
					if (res.status === 409) {
						const data = await res.json();
						if (data.current) {
							conflictReloading = true;
							dirty = false;
							if (saveTimer !== 0) {
								window.clearTimeout(saveTimer);
								saveTimer = 0;
							}
							applyRemote(data.current);
							setSaveState("saved");
							renderAll();
							toast("数据已在别处更新，已重新载入");
						}
						conflictReloading = false;
						return;
					}
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					revision = (await res.json()).revision;
					dirty = false;
					setSaveState("saved");
				} catch (cause) {
					console.warn("[dsh-workbench] 保存失败", cause);
					setSaveState("error");
				}
			}
			function applyRemote(remote) {
				db = {
					spaces: Array.isArray(remote.spaces) ? remote.spaces : [],
					tasks: Array.isArray(remote.tasks) ? remote.tasks : [],
					focus: Array.isArray(remote.focus) ? remote.focus : [],
					settings: remote.settings && typeof remote.settings === "object" ? remote.settings : {}
				};
				revision = typeof remote.revision === "number" ? remote.revision : revision;
				if (ui.selected !== null && taskOf(ui.selected) === void 0) ui.selected = chooseSelection();
				if (timer.taskId !== null && taskOf(timer.taskId) === void 0) timer.taskId = chooseSelection();
			}
			function chooseSelection() {
				const today = todayKey();
				const todays = db.tasks.filter((t) => t.date === today);
				return (todays.find((t) => t.status === "doing") ?? todays.find((t) => t.status !== "done") ?? db.tasks.find((t) => t.status === "doing") ?? db.tasks.find((t) => t.status !== "done") ?? db.tasks[0])?.id ?? null;
			}
			function renderAll() {
				applyTheme();
				if (loaded && ui.project !== "all" && ui.project !== "none" && projectByPath(ui.project) === void 0) ui.project = "all";
				const app = $id("wb-app");
				if (app) {
					app.classList.toggle("collapsed", ui.collapsed);
					app.classList.toggle("compact", ui.compact);
					app.classList.toggle("focus-expand", ui.view === "focus" && ui.focusExpand);
					app.classList.toggle("no-detail", [
						"portal",
						"calendar",
						"focus",
						"stats",
						"news",
						"notes",
						"bugs",
						"product",
						"test"
					].includes(ui.view));
				}
				renderSidebar();
				renderTopbar();
				renderContent();
				renderDetail();
				syncIdeaView();
			}
			function renderSidebar() {
				const ts = todayStats();
				const pct = ts.total > 0 ? Math.round(ts.done / ts.total * 100) : 0;
				let context = "";
				if (ui.view === "portal") {
					const items = projectCards().map((card) => sideItem(`${esc(card.name)}`, {
						icon: "product",
						act: "portal-project",
						id: esc(card.path),
						n: projectTaskCount(card.path),
						active: ui.project === card.path
					})).join("");
					context = sideGroup("项目 / 产品", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">先选项目，再进入对应功能</div>" + sideItem("全部项目", {
						icon: "layers",
						act: "portal-project",
						id: "all",
						n: db.tasks.length,
						active: ui.project === "all"
					}) + items + sideItem("未归属", {
						icon: "inbox",
						act: "portal-project",
						id: "none",
						n: projectTaskCount("none"),
						active: ui.project === "none"
					}) + sideItem("新建项目 / 产品", {
						icon: "plus",
						act: "portal-new"
					}));
				} else if (ui.view === "calendar") context = sideGroup("计划", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">安排时间与节奏</div><div class=\"side-sub\" style=\"padding:2px 8px 4px;color:var(--text-3);font-size:10.5px\">计划视图</div>" + sideItem("时间轴", {
					icon: "list",
					view: "timeline"
				}) + sideItem("日历", {
					icon: "calendar",
					view: "calendar",
					active: true
				}));
				else if (ui.view === "focus") context = sideGroup("专注", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">管理当前任务、计时长度和待专注队列</div>" + sideItem("专注空间", {
					icon: "target",
					view: "focus",
					active: true
				}) + sideItem("待专注", {
					icon: "clock",
					view: "focus",
					n: db.tasks.filter((t) => t.status !== "done").length
				}));
				else if (ui.view === "test") context = sideGroup("测试", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">用例 → 执行 → Bug → 回归 → 报告</div>" + testProjects.map((p) => sideItem(`${esc(p.name)}`, {
					icon: "test",
					act: "test-pick",
					id: p.id,
					active: testProjectSelected === p.id
				})).join("") + sideItem("新建测试项目", {
					icon: "plus",
					act: "test-new"
				}));
				else if (ui.view === "product") context = sideGroup("产品设计", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">导图 → 设计笔记 → 多风格 Demo</div>" + products.map((p) => sideItem(`${esc(p.name)}`, {
					icon: "product",
					act: "product-select",
					id: p.id,
					active: productSelected === p.id
				})).join("") + sideItem("新建产品", {
					icon: "plus",
					act: "product-new"
				}));
				else if (ui.view === "bugs") {
					const projectItems = bugProjects.map((project) => sideItem(`${esc(project.name)} · ${bugs.filter((b) => b.projectId === project.id).length}`, {
						icon: "bug",
						act: "bug-project",
						id: project.id,
						active: bugProjectFilter === project.id
					})).join("");
					context = sideGroup("Bug 项目", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">项目关联 DSH 工作区，可批量在新会话中修复</div>" + sideItem("全部 Bug", {
						icon: "layers",
						act: "bug-project",
						id: "all",
						active: bugProjectFilter === "all"
					}) + projectItems + sideItem("新建项目", {
						icon: "plus",
						act: "bug-project-new"
					}));
				} else if (ui.view === "notes") context = sideGroup("记事本", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">随手记、Markdown、标签与收藏</div>" + sideItem("全部笔记", {
					icon: "notebook",
					view: "notes",
					active: true
				}) + sideItem("新建笔记", {
					icon: "plus",
					act: "note-new"
				}));
				else if (ui.view === "news") context = sideGroup("新闻", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">按主题、按时间用 DSH Agent 检索</div>" + sideItem("新闻检索", {
					icon: "news",
					view: "news",
					active: true
				}) + sideItem("新增订阅", {
					icon: "plus",
					act: "news-add"
				}));
				else if (ui.view === "idea") context = sideGroup("灵感", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">中间一栏管理灵感；画布可在导图 / 力导之间切换</div><div class=\"side-sub\" style=\"padding:2px 8px 4px;color:var(--text-3);font-size:10.5px\">研发视图</div>");
				else if (ui.view === "stats") context = sideGroup("统计", null, "<div class=\"side-sub\" style=\"padding:3px 8px 6px\">用同一套任务数据复盘每天、每周与全年</div>" + sideItem("统计", {
					icon: "chart",
					view: "stats",
					active: true
				}) + sideItem("数据复盘", {
					icon: "spark",
					act: "review"
				}));
				else context = sideGroup("任务", `${ts.pending} 项待处理`, sideItem("今天", {
					icon: "home",
					view: "list",
					scope: "today",
					n: ts.pending,
					active: ui.scope === "today" && ui.view === "list"
				}) + sideItem("全部任务", {
					icon: "inbox",
					view: "list",
					scope: "all",
					n: db.tasks.length,
					active: ui.scope === "all"
				}) + sideItem("看板", {
					icon: "board",
					view: "board",
					active: ui.view === "board"
				}) + sideItem("四象限", {
					icon: "grid",
					view: "matrix",
					active: ui.view === "matrix"
				}) + "<div class=\"side-sub\" style=\"padding:6px 8px 0;color:var(--text-3);font-size:10.5px\">计划视图</div>" + sideItem("时间轴", {
					icon: "list",
					view: "timeline"
				}) + sideItem("日历", {
					icon: "calendar",
					view: "calendar"
				}));
				const spaces = db.spaces.map((space) => sideItem(space.name, {
					dot: space.color,
					space: space.id,
					n: db.tasks.filter((t) => t.space === space.id && t.date === todayKey() && t.status !== "done").length,
					active: ui.space === space.id
				})).join("");
				const sidebar = $id("wb-sidebar");
				if (!sidebar) return;
				sidebar.innerHTML = `
      <div class="brand">
        <div class="brand-mark">${ic("logo", 17)}</div>
        <div><div class="brand-t">个人工作台</div><div class="brand-s">本地工作台 · SQLite</div></div>
        <button class="brand-collapse" data-act="collapse" title="收起侧栏">${ic("panel", 15)}</button>
      </div>
      <div class="side-home${ui.view === "portal" ? " active" : ""}">
        <div class="side-item${ui.view === "portal" ? " active" : ""}" data-act="portal-home">${ic("home", 15)}<span>门户</span></div>
      </div>
      <div class="side-scroll">${context}
        <div class="side-sec">
          <div class="side-head">研发</div>
          ${sideItem("产品设计", {
					icon: "product",
					view: "product",
					active: ui.view === "product"
				})}
          ${sideItem("Bug 管理", {
					icon: "bug",
					view: "bugs",
					active: ui.view === "bugs"
				})}
          ${sideItem("测试", {
					icon: "test",
					view: "test",
					active: ui.view === "test"
				})}
          ${sideItem("灵感", {
					icon: "spark",
					view: "idea",
					active: ui.view === "idea"
				})}
        </div>
        ${ui.view === "portal" ? "" : `<div class="side-sec"><div class="side-head">空间<button class="add" data-act="space-add" title="新建空间">${ic("plus", 13)}</button></div>${spaces}</div>`}
      </div>
      <div class="side-foot">
        <div class="foot-ring" style="--p:${pct}"><i></i></div>
        <div><b>今日进度</b> · 已完成 <b>${ts.done}</b> 项任务</div>
        <button class="icon-btn" data-act="settings" title="工作台设置" aria-label="工作台设置" style="margin-left:auto">${ic("settings", 14)}</button>
      </div>`;
			}
			function sideGroup(title, count, items) {
				return `<div class="side-sec"><div class="side-head">${title}${count ? `<span class="count">${count}</span>` : ""}<button class="add" data-act="new" title="新建任务">${ic("plus", 13)}</button></div>${items}</div>`;
			}
			function sideItem(label, opts) {
				return `<div class="side-item${opts.active ? " active" : ""}" title="${label}" ${opts.view ? `data-view="${opts.view}"` : ""} ${opts.act ? `data-act="${opts.act}"` : ""} ${opts.id ? `data-id="${opts.id}"` : ""} ${opts.scope ? `data-scope="${opts.scope}"` : ""} ${opts.space ? `data-space="${opts.space}"` : ""}>
      ${opts.dot ? `<span class="dot" style="background:${opts.dot}"></span>` : ic(opts.icon ?? "list", 15)}
      <span>${label}</span>${opts.n !== void 0 ? `<span class="n">${opts.n}</span>` : ""}</div>`;
			}
			function openCommandPalette() {
				openModal(`<div class="cmd-palette"><div class="cmd-search">${ic("search", 15)}<input id="wb-cmd-input" placeholder="搜索视图、操作或跳转…" autocomplete="off"><span class="kbd">ESC</span></div>
      <div class="cmd-list" id="wb-cmd-list">${[
					{
						id: "portal",
						label: "项目门户",
						hint: "选项目 / 进功能",
						icon: "home",
						view: "portal"
					},
					{
						id: "board",
						label: "看板",
						hint: "任务视图",
						icon: "board",
						view: "board"
					},
					{
						id: "list",
						label: "行动清单",
						hint: "任务视图",
						icon: "list",
						view: "list"
					},
					{
						id: "timeline",
						label: "时间轴",
						hint: "计划视图",
						icon: "clock",
						view: "timeline"
					},
					{
						id: "matrix",
						label: "四象限",
						hint: "任务视图",
						icon: "grid",
						view: "matrix"
					},
					{
						id: "calendar",
						label: "日历",
						hint: "计划视图",
						icon: "calendar",
						view: "calendar"
					},
					{
						id: "focus",
						label: "专注",
						hint: "当前专注",
						icon: "target",
						view: "focus"
					},
					{
						id: "stats",
						label: "统计",
						hint: "数据复盘",
						icon: "chart",
						view: "stats"
					},
					{
						id: "news",
						label: "新闻",
						hint: "新闻检索",
						icon: "news",
						view: "news"
					},
					{
						id: "notes",
						label: "记事本",
						hint: "笔记",
						icon: "notebook",
						view: "notes"
					},
					{
						id: "bugs",
						label: "Bug 管理",
						hint: "质量看板",
						icon: "bug",
						view: "bugs"
					},
					{
						id: "product",
						label: "产品设计",
						hint: "导图/模块/笔记/Demo",
						icon: "product",
						view: "product"
					},
					{
						id: "test",
						label: "测试",
						hint: "用例/执行/报告",
						icon: "test",
						view: "test"
					},
					{
						id: "idea",
						label: "灵感",
						hint: "发散成导图 / 力导图",
						icon: "spark",
						view: "idea"
					},
					{
						id: "new-task",
						label: "新建任务",
						hint: "⌘N",
						icon: "plus",
						action: "new"
					},
					{
						id: "new-note",
						label: "新建笔记",
						hint: "记事本",
						icon: "plus",
						action: "note-new"
					},
					{
						id: "new-bug",
						label: "新建 Bug",
						hint: "质量管理",
						icon: "plus",
						action: "bug-new"
					},
					{
						id: "new-product",
						label: "新建产品",
						hint: "产品设计",
						icon: "plus",
						action: "product-new"
					},
					{
						id: "new-test",
						label: "新建测试项目",
						hint: "测试",
						icon: "plus",
						action: "test-new"
					},
					{
						id: "theme",
						label: "切换主题",
						hint: "跟随 DSH / 浅 / 深",
						icon: "sun",
						action: "theme"
					},
					{
						id: "settings",
						label: "工作台设置",
						hint: "导出/主题/数据",
						icon: "settings",
						action: "settings"
					}
				].map((c) => `<button class="cmd-row" data-act="cmd-go" data-view="${c.view ?? ""}" data-action="${c.action ?? ""}"><span class="cmd-ico">${ic(c.icon, 15)}</span><span><b>${c.label}</b><small>${c.hint}</small></span></button>`).join("")}</div>
      <div class="cmd-foot">↑↓ 选择 · Enter 执行 · Esc 关闭</div></div>`);
				const input = $id("wb-cmd-input");
				const rows = () => Array.from($id("wb-cmd-list")?.querySelectorAll(".cmd-row") ?? []);
				const filter = () => {
					const q = (input?.value ?? "").trim().toLowerCase();
					rows().forEach((row) => {
						const text = (row.textContent ?? "").toLowerCase();
						row.style.display = q === "" || text.includes(q) ? "" : "none";
					});
				};
				input?.addEventListener("input", filter);
				input?.addEventListener("keydown", (event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						(rows().filter((r) => r.style.display !== "none")[0] ?? input)?.focus();
					}
					if (event.key === "Enter") {
						event.preventDefault();
						rows().find((r) => r.style.display !== "none")?.click();
					}
				});
				window.setTimeout(() => input?.focus(), 20);
			}
			function renderTopbar() {
				const topbar = $id("wb-topbar");
				if (!topbar) return;
				const saveText = saveState === "saved" ? "已自动保存" : saveState === "saving" ? "保存中…" : "保存失败";
				topbar.innerHTML = `
      ${ui.collapsed ? `<button class="icon-btn" data-act="collapse" title="展开侧栏">${ic("panel", 15)}</button>` : ""}
      <div class="crumb">${MODULE_OF[ui.view]} <span>/</span> <b>${NAME_OF[ui.view]}</b></div>
      <div class="searchbar">${ic("search", 14)}<input id="wb-search" placeholder="搜索或跳转…" value="${esc(ui.q)}"><span class="kbd" data-act="cmd" title="命令面板">⌘K</span></div>
      <div class="top-actions">
        <button class="icon-btn" title="${ui.compact ? "标准视图" : "紧凑视图"}" data-act="density">${ic("list", 15)}</button>
        <button class="icon-btn" title="主题" data-act="theme">${ic(resolvedTheme() === "light" ? "moon" : "sun", 15)}</button>
        <span class="save ${saveState === "error" ? "err" : saveState === "saving" ? "busy" : ""}"><i id="save-dot"></i>${saveText}</span>
        <button class="icon-btn" title="通知" data-act="notify">${ic("bell", 15)}</button>
        <button class="btn-primary" data-act="new">${ic("plus", 14)}新建任务</button>
      </div>`;
				const input = $id("wb-search");
				input?.addEventListener("input", () => {
					ui.q = input.value;
					renderContent();
				});
			}
			const FILTER_LABEL = {
				all: "筛选",
				high: "高优先级",
				sub: "有子待办",
				attach: "有附件",
				unscheduled: "未排时间"
			};
			const SORT_LABEL = {
				time: "按时间",
				priority: "按优先级",
				created: "按创建",
				title: "按标题"
			};
			const MODULE_OF = {
				portal: "工作台",
				board: "任务",
				list: "任务",
				timeline: "计划",
				matrix: "任务",
				calendar: "计划",
				focus: "专注",
				stats: "统计",
				news: "新闻",
				notes: "记事本",
				bugs: "Bug 管理",
				product: "产品设计",
				test: "测试",
				idea: "研发"
			};
			const NAME_OF = {
				portal: "项目门户",
				board: "看板",
				list: "行动清单",
				timeline: "时间轴",
				matrix: "四象限",
				calendar: "日历",
				focus: "当前专注",
				stats: "数据复盘",
				news: "新闻检索",
				notes: "笔记",
				bugs: "质量管理",
				product: "产品",
				test: "测试",
				idea: "灵感"
			};
			function renderContent() {
				if (ui.view === "idea") {
					syncIdeaView();
					return;
				}
				const el = $id("wb-generic") ?? content();
				if (!el) return;
				if (!loaded) {
					el.innerHTML = loadError !== "" ? `<div class="wb-error"><div>工作台数据读取失败</div><div class="muted">${esc(loadError)}</div><button class="btn" data-act="retry">重试</button></div>` : "<div class=\"wb-loading\"><div class=\"spin\"></div><div>正在读取工作台…</div></div>";
					return;
				}
				let html = "";
				if (ui.view === "portal") html = renderPortal();
				else if (ui.view === "board") html = renderBoard();
				else if (ui.view === "list") html = renderList();
				else if (ui.view === "timeline") html = renderTimeline();
				else if (ui.view === "matrix") html = renderMatrix();
				else if (ui.view === "calendar") html = renderCalendar();
				else if (ui.view === "focus") html = renderFocus();
				else if (ui.view === "news") html = renderNews();
				else if (ui.view === "notes") html = renderNotes();
				else if (ui.view === "bugs") html = renderBugs();
				else if (ui.view === "product") html = renderProduct();
				else if (ui.view === "test") html = renderTests();
				else html = renderStats();
				el.innerHTML = html;
				bindContentInputs();
				const projectPicker = $id("wb-project");
				projectPicker?.addEventListener("change", () => {
					ui.project = projectPicker.value;
					const card = projectByPath(ui.project);
					if (card?.product !== void 0) productSelected = card.product.id;
					if (card?.bugProject !== void 0) bugProjectFilter = card.bugProject.id;
					db.settings.project = ui.project === "none" ? "" : ui.project;
					scheduleSave();
					renderAll();
				});
				if (ui.view === "notes") bindNotes();
				if (ui.view === "bugs") bindBugs();
				if (ui.view === "product") {
					bindProduct();
					if (productTab === "map") mountProductCanvas();
				}
				if (ui.view === "test") bindTests();
			}
			function bindContentInputs() {
				const queueSearch = $id("wb-queue-search");
				queueSearch?.addEventListener("input", () => {
					ui.queueQ = queueSearch.value;
					renderContent();
					const next = $id("wb-queue-search");
					next?.focus();
					next?.setSelectionRange(next.value.length, next.value.length);
				});
				const boardSearch = $id("wb-board-search");
				boardSearch?.addEventListener("input", () => {
					ui.q = boardSearch.value;
					renderContent();
					const next = $id("wb-board-search");
					next?.focus();
					next?.setSelectionRange(next.value.length, next.value.length);
				});
				const listSearch = $id("wb-list-search");
				listSearch?.addEventListener("input", () => {
					ui.q = listSearch.value;
					renderContent();
					const next = $id("wb-list-search");
					next?.focus();
					next?.setSelectionRange(next.value.length, next.value.length);
				});
				for (const id of ["wb-quick-add"]) {
					const input = $id(id);
					input?.addEventListener("keydown", (e) => {
						if (e.key === "Enter" && input.value.trim() !== "") createTask({
							title: input.value.trim(),
							space: ui.space !== "all" ? ui.space : db.spaces[2]?.id ?? "life",
							date: todayKey()
						});
					});
				}
			}
			function viewHead() {
				const ts = todayStats();
				const scoped = db.tasks.filter(matchProject);
				const all = ui.scope === "all";
				const total = all ? scoped.length : ts.total;
				const done = all ? scoped.filter((t) => doneOf(t)).length : ts.done;
				const pending = all ? scoped.filter((t) => !doneOf(t)).length : ts.pending;
				const pct = total > 0 ? Math.round(done / total * 100) : 0;
				const today = todayKey();
				const scopeText = ui.project === "all" ? "" : ` · 项目：${esc(projectLabel(ui.project))}`;
				return `<div class="view-head">
      <div><div class="eyebrow">${all ? "全部任务" : "今日任务"}</div><h1 class="page-title">${all ? "全部任务" : "今天"}</h1>
      <div class="page-sub">${all ? `共 ${total} 项任务 · 待处理 ${pending} 项${scopeText}` : `${fmtDay(today)} ${weekdayName(today)} · 待处理 ${pending} 项${scopeText}`}</div></div>
      <div class="progress-card"><div class="p-ring" style="--p:${pct}"><i>${pct}%</i></div>
        <div><div class="p-num">${done} / ${total}</div><div class="p-lab">${all ? "已完成" : "今日完成"}</div></div></div>
    </div>`;
			}
			function taskSeg() {
				return `<div class="viewbar"><div class="seg">${[
					[
						"list",
						"行动清单",
						"list"
					],
					[
						"timeline",
						"时间轴",
						"clock"
					],
					[
						"board",
						"看板",
						"board"
					],
					[
						"matrix",
						"四象限",
						"grid"
					]
				].map(([v, label, icon]) => `<button data-view="${v}" class="${ui.view === v ? "active" : ""}">${ic(icon, 13)}${label}</button>`).join("")}</div>
      <div class="mini-seg" style="margin-left:2px"><button data-scope="today" class="${ui.scope === "today" ? "active" : ""}">今天</button><button data-scope="all" class="${ui.scope === "all" ? "active" : ""}">全部</button></div>
      <div class="filters">
        ${projectSelect()}
        <button class="chip ${ui.space === "all" ? "active" : ""}" data-space="all">空间：全部</button>
        ${db.spaces.map((s) => `<button class="chip ${ui.space === s.id ? "active" : ""}" data-space="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`).join("")}
        <button class="chip ghost${ui.filter !== "all" ? " active" : ""}" data-act="filter">${ic("filter", 13)}${ui.filter === "all" ? "筛选" : FILTER_LABEL[ui.filter]}</button>
        <button class="chip ghost" data-act="sort">${ic("sort", 13)}${SORT_LABEL[ui.sort]}</button>
      </div></div>`;
			}
			function renderPortal() {
				const cards = projectCards();
				const all = ui.project === "all";
				const none = ui.project === "none";
				const scopeTasks = all ? db.tasks.length : none ? projectTaskCount("none") : projectTaskCount(ui.project);
				const scopeBugs = all ? bugs.length : none ? 0 : projectBugCount(ui.project);
				const scopeTests = all ? testProjects.length : none ? 0 : projectTestCount(ui.project);
				const scopeNotes = all ? notes.length : none ? 0 : projectNoteCount(ui.project);
				const openBugs = bugs.filter((bug) => bug.status !== "resolved").length;
				const today = todayStats();
				const scopedTasks = db.tasks.filter(matchProject);
				const openCount = scopedTasks.filter((task) => task.status !== "done").length;
				const datedCount = scopedTasks.filter((task) => task.date !== null).length;
				const tile = (path, name, counts, opts) => {
					const keyPath = opts.all === true ? "all" : opts.none === true ? "none" : path;
					const active = ui.project === keyPath;
					const foot = opts.all === true || opts.none === true ? "<span class=\"portal-hint\">点卡片切换范围</span>" : opts.product !== void 0 ? `<button class="btn tiny" data-act="portal-edit" data-id="${opts.product.id}">${ic("edit", 11)}编辑</button><button class="btn tiny" data-act="portal-delete" data-id="${opts.product.id}">${ic("trash", 11)}删除</button>` : `<button class="btn tiny" data-act="portal-new" data-path="${esc(path)}">${ic("plus", 11)}为它建产品</button>`;
					return `<article class="portal-card${active ? " active" : ""}" data-act="portal-project" data-id="${esc(keyPath)}">
        <div class="portal-card-h">
          <span class="portal-ico${opts.all === true ? " accent" : ""}">${opts.all === true ? ic("layers", 15) : opts.none === true ? ic("inbox", 15) : ic("product", 15)}</span>
          <div class="portal-card-t"><b>${esc(name)}</b><small>${opts.all === true ? "跨项目汇总" : opts.none === true ? "还没有归属项目的任务" : esc(bugWorkspaceName(path))}</small></div>
          ${active ? `<span class="portal-check">${ic("check", 11)}</span>` : ""}
        </div>
        ${opts.all === true || opts.none === true ? "" : `<div class="portal-path" title="${esc(path)}">${esc(path)}</div>`}
        <div class="portal-metrics"><span><b>${counts.tasks}</b> 任务</span><span><b>${counts.bugs}</b> Bug</span><span><b>${counts.tests}</b> 测试</span><span><b>${counts.notes}</b> 笔记</span></div>
        ${opts.all === true || opts.none === true ? "" : `<div class="portal-card-tags">${opts.product !== void 0 ? "<span>产品</span>" : ""}${opts.bugProject !== void 0 ? "<span class=\"green\">Bug 项目</span>" : ""}${opts.tests !== void 0 && opts.tests.length > 0 ? "<span class=\"cyan\">测试项目</span>" : ""}</div>`}
        <div class="portal-card-foot">${foot}<button class="btn tiny portal-enter" data-act="portal-enter" data-id="${esc(keyPath)}" data-view="list">进入${ic("arrowR", 11)}</button></div>
      </article>`;
				};
				const features = [
					{
						view: "list",
						title: "任务清单",
						desc: "今天 / 全部 · 按项目筛选",
						icon: "list",
						count: scopeTasks,
						tile: "#2563eb"
					},
					{
						view: "board",
						title: "看板",
						desc: "下一步 / 进行中 / 等待中",
						icon: "board",
						count: openCount,
						tile: "#0f9f6e"
					},
					{
						view: "calendar",
						title: "日历",
						desc: "周 / 月 / 年安排",
						icon: "calendar",
						count: datedCount,
						tile: "#d97706"
					},
					{
						view: "stats",
						title: "统计",
						desc: "完成趋势与项目复盘",
						icon: "chart",
						count: null,
						tile: "#7c3aed"
					},
					{
						view: "focus",
						title: "专注",
						desc: "番茄计时与待专注队列",
						icon: "target",
						count: null,
						tile: "#db2777"
					},
					{
						view: "bugs",
						title: "Bug 管理",
						desc: "缺陷看板与 AI 修复",
						icon: "bug",
						count: scopeBugs,
						tile: "#d83b3b"
					},
					{
						view: "test",
						title: "测试",
						desc: "用例 / 执行 / 回归",
						icon: "test",
						count: scopeTests,
						tile: "#0891b2"
					},
					{
						view: "idea",
						title: "灵感",
						desc: "多角度发散 · 导图 / 力导",
						icon: "spark",
						count: null,
						tile: "#5b5bd6"
					},
					{
						view: "product",
						title: "产品设计",
						desc: "导图 / 设计笔记 / Demo",
						icon: "product",
						count: null,
						tile: "#5b5bd6"
					},
					{
						view: "notes",
						title: "记事本",
						desc: "笔记与 PDF 导出",
						icon: "notebook",
						count: scopeNotes,
						tile: "#c27c0e"
					},
					{
						view: "news",
						title: "新闻",
						desc: "定时检索与 AI 摘要",
						icon: "news",
						count: null,
						tile: "#0f766e"
					}
				];
				/** 单个功能卡（分组内外共用同一套外观）。 */
				const featureCard = (item) => `<button class="portal-feature" style="--tile:${item.tile}" data-act="portal-open" data-view="${item.view}">
        <span class="portal-feature-ico">${ic(item.icon, 19)}</span>
        <span class="portal-feature-main"><b>${item.title}</b><small>${esc(item.desc)}</small></span>
        ${item.count !== null ? `<span class="portal-feature-n">${item.count}</span>` : `<span class="portal-feature-go">${ic("arrowR", 13)}</span>`}
      </button>`;
				/** 功能区：按 PORTAL_GROUPS 分组，每组一整行，组内网格自适应。 */
				const featureGroups = (() => {
					const byView = new Map(features.map((item) => [item.view, item]));
					return PORTAL_GROUPS.map((group) => {
						const items = group.views.map((view) => byView.get(view)).filter((item) => item !== void 0);
						if (items.length === 0) return "";
						return `<section class="portal-group" data-group="${group.id}">
        <div class="portal-group-head"><h3><span class="portal-group-dot"></span>${group.title}</h3><span class="portal-group-meta">${items.length} 个功能 · ${group.hint}</span></div>
        <div class="portal-features">${items.map(featureCard).join("")}</div>
      </section>`;
					}).join("");
				})();
				const cardAll = tile("all", "全部项目", {
					tasks: db.tasks.length,
					bugs: bugs.length,
					tests: testProjects.length,
					notes: notes.length
				}, { all: true });
				const cardNone = tile("none", "未归属", {
					tasks: projectTaskCount("none"),
					bugs: 0,
					tests: 0,
					notes: 0
				}, { none: true });
				const cardProjects = cards.map((card) => tile(card.path, card.name, {
					tasks: projectTaskCount(card.path),
					bugs: projectBugCount(card.path),
					tests: projectTestCount(card.path),
					notes: projectNoteCount(card.path)
				}, {
					product: card.product,
					bugProject: card.bugProject,
					tests: card.tests
				})).join("");
				return `<div class="view-head portal-head">
      <div><div class="eyebrow">门户</div><h1 class="page-title">工作台</h1>
        <div class="page-sub">先选项目 / 产品，再进入对应功能；项目在这里直接管理</div>
        <div class="head-pills"><span><b>${cards.length}</b> 项目</span><span><b>${db.tasks.length}</b> 任务</span><span><b>${openBugs}</b> 未关闭 Bug</span><span><b>${testProjects.length}</b> 测试项目</span><span><b>${today.done}</b> 今日完成</span></div></div>
      <div class="portal-actions"><span class="portal-scope">当前：<b>${esc(projectLabel(ui.project))}</b></span>
        <button class="btn" data-act="portal-load" title="重新读取项目 / Bug / 测试">${ic("refresh", 13)}刷新</button>
        <button class="btn-primary" data-act="portal-new">${ic("plus", 14)}新建项目 / 产品</button></div>
    </div>
    <div class="portal-sec-head"><h2>项目 / 产品</h2><span>${cards.length} 个项目 · 卡片内可编辑、删除</span></div>
    <div class="portal-projects">${cardAll}${cardProjects}${cardNone}</div>
    ${cards.length === 0 ? `<div class="portal-empty">${ic("layers", 16)}<div><b>还没有项目</b><span>新建一个项目 / 产品并关联 DSH 工作区，任务、Bug、测试、笔记就会按项目归拢。</span></div><button class="btn" data-act="portal-new">${ic("plus", 12)}新建</button></div>` : ""}
    <div class="portal-sec-head"><h2>功能区</h2><span>按业务分组 · 每组整行铺满，卡片随宽度自适应</span></div>
    ${featureGroups}
    ${agentPanel.sectionHtml()}`;
			}
			let ideaView = null;
			/** 灵感视图常驻（编辑器实例不能每次重建），按当前视图显隐。 */
			function ensureIdeaView() {
				if (ideaView !== null) return ideaView;
				const root = $id("wb-idea-root");
				if (root === null) return null;
				ideaView = createIdeaView(root, {
					api: API,
					esc,
					ic,
					toast: (message) => toast(message),
					confirm: (message) => typeof window.confirm === "function" ? window.confirm(message) : true,
					openModal,
					closeModal,
					dispatch: (projectPath, prompt) => dispatchToNewSession(projectPath, prompt),
					agent: {
						teams: () => agentPanel.teams().map((team) => ({
							id: team.id,
							name: team.name,
							memberCount: team.memberCount
						})),
						dispatch: (input, handlers) => startAgentDispatch(input, handlers),
						prompt: (sessionId, text) => sendToSession(sessionId, text),
						stop: (dispatchId, sessionId) => stopAgentDispatch(dispatchId, sessionId),
						openSession: (sessionId) => focusSession(sessionId),
						history: (sessionId) => readSessionEvents(sessionId)
					},
					isDark: () => resolvedTheme() === "dark",
					portalProjects: () => projectCards().filter((card) => card.path !== "" && card.path !== "all" && card.path !== "none").map((card) => ({
						name: card.name,
						workspacePath: card.path
					}))
				});
				return ideaView;
			}
			function syncIdeaView() {
				const on = ui.view === "idea";
				$id("wb-app")?.classList.toggle("idea-mode", on);
				const generic = $id("wb-generic");
				const root = $id("wb-idea-root");
				if (generic !== null) generic.style.display = on ? "none" : "";
				if (root !== null) root.style.display = on ? "" : "none";
				if (on) ensureIdeaView()?.show();
				else ideaView?.hide();
			}
			function renderBoard() {
				const cols = [
					["next", "下一步"],
					["doing", "进行中"],
					["waiting", "等待中"]
				];
				const total = pool().filter((t) => t.status !== "done" && visible(t)).length;
				return viewHead() + taskSeg() + `<div class="listbar">${ic("search", 13)}<input placeholder="搜索当前看板" id="wb-board-search" value="${esc(ui.q)}"><span>${total} 项</span></div>
      <div class="kanban">${cols.map(([status, label]) => {
					const arr = sortTasks(pool().filter((t) => t.status === status && visible(t)));
					return `<div class="col"><div class="col-head"><span class="dot" style="background:${STATUS_COLOR[status]}"></span>${label}<span class="n">${arr.length}</span>
          <button class="add" data-act="new" title="新建任务">${ic("plus", 14)}</button></div>
          ${arr.map(cardOf).join("") || "<div class=\"col-empty\">暂无任务</div>"}
          <div class="col-search" style="border-style:dashed">${ic("list", 12)}本列 ${arr.length} 项<span style="margin-left:auto">${ui.sort === "time" ? "按时间" : ui.sort === "priority" ? "按优先级" : ui.sort === "created" ? "按创建" : "按标题"}</span></div>
        </div>`;
				}).join("")}</div>`;
			}
			function cardOf(t) {
				const space = spaceOf(t.space);
				const flags = [];
				if (t.attachments.length > 0) flags.push(ic("paperclip", 12));
				if (t.priority === "high") flags.push(`<span style="color:var(--red)">${ic("flag", 12)}</span>`);
				if (t.note !== "") flags.push(ic("note", 12));
				if (t.subtasks.length > 0) flags.push(`<span class="sub-progress">${ic("checkSquare", 12)}${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}</span>`);
				const desc = t.desc || t.note;
				return `<article class="task-card${ui.selected === t.id ? " selected" : ""}" data-id="${t.id}">
      <div class="card-top"><span class="sp"><span class="dot" style="background:${space.color}"></span>${esc(space.name)}</span>
        <span class="flags">${flags.join("")}</span></div>
      <h3>${esc(t.title)}</h3>${desc ? `<p>${esc(desc)}</p>` : ""}
      <div class="card-foot"><span>${ic("clock", 11)} ${timeText(t)}</span>
        ${t.status === "doing" ? `<span class="sync">${ic("arrowR", 11)} 详情已同步</span>` : ""}</div>
    </article>`;
			}
			function rowOf(t) {
				const space = spaceOf(t.space);
				const done = t.status === "done";
				return `<div class="row${ui.selected === t.id ? " selected" : ""}${done ? " done-row" : ""}" data-id="${t.id}">
      <button class="check${done ? " done" : ""}" data-act="toggle" data-id="${t.id}" title="完成">${done ? ic("check", 11) : ""}</button>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div>
        <div class="row-meta"><span class="dot" style="background:${space.color}"></span>${esc(space.name)}
          <span>${timeText(t)}</span>${t.duration ? `<span>${t.duration} 分钟</span>` : ""}
          ${t.status === "doing" ? "<span class=\"pill green\">" + ic("playSmall", 9) + "进行中</span>" : ""}
          ${t.status === "waiting" ? "<span class=\"pill amber\">" + ic("playSmall", 9) + "等待中</span>" : ""}</div></div>
      <div class="row-right">${t.subtasks.length > 0 ? `<span class="sub-progress">${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} ${ic("chevR", 11)}</span>` : ""}
        ${t.priority === "high" ? `<span style="color:var(--red)">${ic("flag", 12)}</span>` : ""}${ic("chevR", 13)}</div>
    </div>`;
			}
			function renderList() {
				const doing = sortTasks(pool().filter((t) => t.status === "doing" && visible(t)));
				const next = sortTasks(pool().filter((t) => t.status === "next" && visible(t)));
				const waiting = sortTasks(pool().filter((t) => t.status === "waiting" && visible(t)));
				const done = sortTasks(pool().filter((t) => t.status === "done" && visible(t)));
				const group = (title, arr) => `<div class="group"><div class="group-head">${title}<span class="n">${arr.length} 项</span></div>${arr.map(rowOf).join("") || "<div class=\"col-empty\">暂无任务</div>"}</div>`;
				return viewHead() + taskSeg() + `<div class="quickbar">${ic("plus", 14)}<input id="wb-quick-add" placeholder="快速记录任务，按 Enter 保存"><span class="hint"><span class="kbd">今天</span><span class="kbd">Enter</span></span></div>
      <div class="listbar">${ic("search", 13)}<input placeholder="搜索当前清单" id="wb-list-search" value="${esc(ui.q)}"><span>${pool().filter(visible).length} 项</span></div>
      ${doing.length > 0 ? group("正在进行", doing) : ""}
      ${next.length > 0 ? group("接下来", next) : ""}
      ${waiting.length > 0 ? group("等待中", waiting) : ""}
      ${done.length > 0 ? group("已完成", done) : ""}`;
			}
			function renderTimeline() {
				const arr = sortTasks(db.tasks.filter((t) => t.date === todayKey() && visible(t)), "time");
				return viewHead() + taskSeg() + `<div class="quickbar">${ic("plus", 14)}<input id="wb-quick-add" placeholder="快速记录任务，按 Enter 保存"><span class="hint"><span class="kbd">今天</span><span class="kbd">Enter</span></span></div>
      <div class="listbar">${ic("search", 13)}<input placeholder="搜索当前时间轴" id="wb-list-search" value="${esc(ui.q)}"><span>${arr.length} 项</span></div>
      <div class="tl"><div class="tl-head"><div>时间</div><div>今日安排</div></div>
        ${arr.map((t) => {
					const space = spaceOf(t.space);
					return `<div class="tl-row"><div class="tl-time"><b>${t.start || "待定"}</b>${t.end ? "至 " + t.end : ""}</div>
          <div class="tl-body" data-id="${t.id}"><div class="tl-item ${t.status === "doing" ? "doing" : ""}">
            <div class="ti-main"><div class="ti-title">${esc(t.title)}</div>
            <div class="ti-meta">${esc(space.name)} · ${t.duration ? t.duration + " 分钟 · " : ""}${STATUS_LABEL[t.status]}</div></div>
            <div class="ti-right">${t.status === "doing" ? "<span class=\"pill green\">" + ic("playSmall", 9) + "进行中</span>" : t.status === "waiting" ? "<span class=\"pill amber\">" + ic("playSmall", 9) + "等待中</span>" : t.status === "done" ? "<span class=\"pill gray\">已完成</span>" : ""}
              <button class="check${t.status === "done" ? " done" : ""}" data-act="toggle" data-id="${t.id}">${t.status === "done" ? ic("check", 11) : ""}</button></div>
          </div></div></div>`;
				}).join("")}
      </div>
      <div class="listbar" style="margin-top:10px;justify-content:space-between"><span>共 ${arr.length} 项 · ${fmtDay(todayKey())}</span><span>按时间排序</span></div>`;
			}
			function renderMatrix() {
				const all = sortTasks(pool().filter((t) => t.status !== "done" && visible(t)));
				return viewHead() + taskSeg() + `<div class="matrix">${[
					[
						"重要且紧急",
						"立即动手",
						(t) => t.priority === "high"
					],
					[
						"重要不紧急",
						"安排时间",
						(t) => t.priority !== "high" && t.space !== "life"
					],
					[
						"紧急不重要",
						"尽快处理",
						(t) => t.priority !== "high" && t.space === "life"
					],
					[
						"不重要不紧急",
						"有空再看",
						(t) => t.priority === "low"
					]
				].map(([title, sub, fn]) => {
					const arr = all.filter(fn);
					return `<div class="quad"><h4>${title}</h4><div class="qsub">${sub} · ${arr.length} 项</div>
        ${arr.map((t) => `<div class="mini" data-id="${t.id}"><span class="dot" style="background:${spaceOf(t.space).color}"></span>${esc(t.title)}<span style="margin-left:auto;color:var(--text-3)">${t.start || ""}</span></div>`).join("") || "<div class=\"col-empty\">暂无任务</div>"}
      </div>`;
				}).join("")}</div>`;
			}
			function renderCalendar() {
				const modeSeg = `<div class="mini-seg">${[
					"week",
					"month",
					"year"
				].map((m) => `<button data-act="cal-mode" data-mode="${m}" class="${ui.calendarMode === m ? "active" : ""}">${m === "week" ? "周" : m === "month" ? "月" : "年"}</button>`).join("")}</div>`;
				const range = ui.calendarMode === "week" ? `${startOfWeek(ui.calendarAnchor)} — ${addDays(startOfWeek(ui.calendarAnchor), 6)}` : ui.calendarMode === "month" ? `${ui.calendarAnchor.slice(0, 7)}` : `${ui.calendarAnchor.slice(0, 4)} 年`;
				const head = `<div class="view-head"><div><div class="eyebrow">计划</div><h1 class="page-title">日历</h1>
      <div class="page-sub">按周、月或年查看任务安排${ui.project === "all" ? "" : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div><div class="head-tools">${projectSelect()}${modeSeg}</div></div>`;
				let body = "";
				if (ui.calendarMode === "week") body = calendarWeek();
				else if (ui.calendarMode === "month") body = calendarMonth();
				else body = calendarYear();
				return head + body + `<div class="listbar" style="margin-top:10px;justify-content:space-between"><span>${range}</span><span>${ic("calendar", 12)} 共 ${db.tasks.filter((t) => t.date !== null && matchProject(t)).length} 项有日期任务</span></div>`;
			}
			function calendarWeek() {
				const start = startOfWeek(ui.calendarAnchor);
				const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
				const hours = [
					"08:00",
					"09:00",
					"10:00",
					"11:00",
					"12:00",
					"13:00",
					"14:00",
					"15:00",
					"16:00",
					"17:00",
					"18:00",
					"19:00",
					"20:00",
					"21:00"
				];
				const hourPx = 52;
				const evFor = (day) => db.tasks.filter((t) => t.date === day && visible(t));
				const today = todayKey();
				const todayEvents = evFor(today).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
				return `<div class="cal-wrap"><div class="cal-main">
      <div class="cal-top"><div class="range"><button class="icon-btn" data-act="cal-prev">${ic("chevL", 14)}</button>${start} — ${days[6]}<button class="icon-btn" data-act="cal-next">${ic("chevR", 14)}</button></div></div>
      <div class="cal-scroll"><div class="cal-grid">
        <div class="cal-corner"></div>
        ${days.map((d) => `<div class="cal-dayh ${d === today ? "today" : ""}"><b>${fmtDay(d)}</b>${weekdayName(d)}<span class="cnt">${evFor(d).length}项</span></div>`).join("")}
        <div class="cal-gutter" style="min-height:44px">全天</div>
        ${days.map((d) => `<div class="cal-cell" style="min-height:44px">${evFor(d).filter((t) => !t.start || (t.duration || 0) >= 480).map((t) => `<div class="cal-ev" style="--ev:${spaceOf(t.space).color};position:static;margin:2px" data-id="${t.id}"><b>${esc(t.title)}</b></div>`).join("")}</div>`).join("")}
        ${hours.map((h) => `<div class="cal-gutter">${h}</div>${days.map((d) => {
					const evs = evFor(d).filter((t) => t.start && (t.duration || 0) < 480 && t.start.slice(0, 2) === h.slice(0, 2));
					return `<div class="cal-cell ${d === today ? "today" : ""}" style="height:${hourPx}px">${evs.map((t) => {
						const [sh, sm] = t.start.split(":").map(Number);
						const dur = t.duration || 30;
						const top = Math.max(0, (sh * 60 + sm) % 60) / 60 * hourPx;
						const height = Math.max(24, Math.min(dur, 90) / 60 * hourPx - 2);
						return `<div class="cal-ev" style="--ev:${spaceOf(t.space).color};top:${top + 2}px;height:${height}px" data-id="${t.id}"><b>${esc(t.title)}</b><span>${t.start}${t.end ? "–" + t.end : ""} · ${esc(spaceOf(t.space).name)}</span></div>`;
					}).join("")}</div>`;
				}).join("")}`).join("")}
      </div></div>
    </div>
    <div class="cal-rail"><div class="rail-head">${ic("calendar", 13)} 今天</div>
      <div class="rail-sub">${todayEvents.length} 项安排 · 已完成 ${todayEvents.filter((t) => t.status === "done").length} 项</div>
      ${todayEvents.map((t) => `<div class="rail-item" data-id="${t.id}"><span class="t">${t.start || "--:--"}</span>
        <span class="rm"><b>${esc(t.title)}</b><span>${esc(spaceOf(t.space).name)} · ${STATUS_LABEL[t.status]}</span></span>
        <span class="dot" style="background:${spaceOf(t.space).color}"></span></div>`).join("") || "<div class=\"col-empty\">今天暂无安排</div>"}
      <div class="listbar" style="margin:8px 0 0;justify-content:space-between"><span>共 ${todayEvents.length} 项</span><span>${weekdayName(todayKey())}</span></div>
    </div></div>`;
			}
			function calendarMonth() {
				const gridStart = startOfWeek(startOfMonth(ui.calendarAnchor));
				const month = parseDate(ui.calendarAnchor).getMonth();
				const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
				const today = todayKey();
				return `<div class="month-grid">
      ${[
					"周日",
					"周一",
					"周二",
					"周三",
					"周四",
					"周五",
					"周六"
				].map((w) => `<div class="month-head">${w}</div>`).join("")}
      ${cells.map((d) => {
					const evs = db.tasks.filter((t) => t.date === d && visible(t));
					return `<div class="month-cell${parseDate(d).getMonth() !== month ? " dim" : ""}${d === today ? " today" : ""}" data-act="cal-day" data-day="${d}">
          <div class="d">${parseDate(d).getDate()}</div>
          ${evs.slice(0, 3).map((t) => `<div class="me"><i style="background:${spaceOf(t.space).color}"></i>${esc(t.title)}</div>`).join("")}
          ${evs.length > 3 ? `<div class="me">+${evs.length - 3} 项</div>` : ""}
        </div>`;
				}).join("")}
    </div>`;
			}
			function calendarYear() {
				const year = parseDate(ui.calendarAnchor).getFullYear();
				return `<div class="year-grid">${Array.from({ length: 12 }, (_, m) => {
					const first = `${year}-${pad(m + 1)}-01`;
					const daysInMonth = new Date(year, m + 1, 0).getDate();
					const lead = parseDate(first).getDay();
					const marks = Array.from({ length: lead + daysInMonth }, (_, i) => {
						if (i < lead) return "<i></i>";
						const d = `${year}-${pad(m + 1)}-${pad(i - lead + 1)}`;
						const n = db.tasks.filter((t) => t.date === d && matchProject(t)).length;
						return `<i class="${n > 0 ? "has" : ""}" title="${d} · ${n} 项"></i>`;
					}).join("");
					const count = db.tasks.filter((t) => t.date?.startsWith(`${year}-${pad(m + 1)}`) && matchProject(t)).length;
					return `<div class="year-card" data-act="cal-month" data-month="${year}-${pad(m + 1)}-01"><h5>${m + 1} 月<span>${count} 项</span></h5><div class="year-mini">${marks}</div></div>`;
				}).join("")}</div>`;
			}
			function renderFocus() {
				const current = taskOf(timer.taskId) ?? db.tasks.find((t) => t.status === "doing") ?? db.tasks[0];
				const minutes = Math.floor(timer.remaining / 60);
				const seconds = timer.remaining % 60;
				const total = timer.preset * 60;
				const pct = Math.max(0, Math.min(100, Math.round((1 - timer.remaining / total) * 100)));
				const queueAll = db.tasks.filter((t) => t.status !== "done" && matchProject(t)).sort((a, b) => {
					if (a.id === timer.taskId) return -1;
					if (b.id === timer.taskId) return 1;
					return `${a.date ?? ""} ${a.start || "99:99"}`.localeCompare(`${b.date ?? ""} ${b.start || "99:99"}`);
				});
				const qq = ui.queueQ.trim().toLowerCase();
				const queue = qq === "" ? queueAll : queueAll.filter((t) => t.title.toLowerCase().includes(qq));
				const presets = [
					15,
					25,
					45,
					60
				];
				const custom = !presets.includes(timer.preset);
				const focus = todayFocus();
				return `<div class="view-head"><div><div class="eyebrow">专注计时</div><h1 class="page-title">专注</h1>
      <div class="page-sub">管理当前任务、计时长度和待专注队列${ui.project === "all" ? "" : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div><div class="head-tools">${projectSelect()}</div></div>
      <div class="focus-wrap">
        <div class="focus-card"><div class="focus-card-top">${ic("target", 14)} 专注空间<button class="icon-btn" data-act="focus-expand" title="${ui.focusExpand ? "退出沉浸" : "沉浸模式"}">${ic("expand", 14)}</button></div>
          <div class="presets">${presets.map((n) => `<button data-act="preset" data-n="${n}" class="${timer.preset === n ? "active" : ""}">${n} 分钟</button>`).join("")}<button data-act="custom-timer" class="${custom ? "active" : ""}">${custom ? timer.preset + " 分钟" : "自定义"}</button></div>
          <div class="focus-center">
            <div class="timer-ring" style="--p:${pct}"><div class="timer-inner"><div class="timer-time">${pad(minutes)}:${pad(seconds)}</div><div class="timer-lab">专注计时</div></div></div>
            <div class="focus-task">当前任务<b>${esc(current?.title ?? "未选择任务")}</b></div>
            <div class="focus-btns"><button class="btn" data-act="reset" title="重置">${ic("rotate", 14)}</button>
              <button class="btn solid" data-act="toggle-timer">${timer.running ? ic("pause", 13) : ic("play", 13)} ${timer.running ? "暂停" : "开始"}</button></div>
          </div>
          <div class="focus-stats"><div><b>${focus.minutes}</b>今日专注 / 分钟</div><div><b>${focus.rounds}</b>完成轮次 / 次</div></div>
        </div>
        <div class="queue"><div class="q-head">${ic("layers", 13)}专注队列<span class="n">${queue.length} 项</span></div>
          <div class="listbar" style="height:28px;margin-bottom:6px">${ic("search", 12)}<input placeholder="搜索专注队列" id="wb-queue-search" value="${esc(ui.queueQ)}"><span>${queue.length}</span></div>
          ${queue.slice(0, 14).map((t, i) => `<div class="q-item ${t.id === timer.taskId ? "active" : ""}" data-act="queue" data-id="${t.id}">
            <span class="q-num">${String(i + 1).padStart(2, "0")}</span>
            <span class="q-main"><span class="q-title">${esc(t.title)}</span>
            <span class="q-meta">${t.status === "doing" ? "进行中" : "待开始"} · ${t.date === todayKey() ? "今天" : t.date ?? "未安排"} ${t.start ? "· " + t.start + (t.end ? "–" + t.end : "") : ""}</span></span></div>`).join("")}
        </div>
      </div>`;
			}
			function statsRange() {
				const today = todayKey();
				if (ui.statsPeriod === "month") {
					const first = startOfMonth(today);
					const d = parseDate(first);
					return {
						start: first,
						end: dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
						label: "本月"
					};
				}
				if (ui.statsPeriod === "year") {
					const year = parseDate(today).getFullYear();
					return {
						start: `${year}-01-01`,
						end: `${year}-12-31`,
						label: "本年"
					};
				}
				return {
					start: isoWeekStart(),
					end: addDays(isoWeekStart(), 6),
					label: "本周"
				};
			}
			function stampDate(value) {
				return (value ?? "").slice(0, 10);
			}
			function doneIn(start, end) {
				return db.tasks.filter((t) => doneOf(t) && matchProject(t) && inRange(stampDate(doneAt(t)), start, end));
			}
			function trendBuckets(range) {
				if (ui.statsPeriod === "year") {
					const year = Number(range.start.slice(0, 4));
					return Array.from({ length: 12 }, (_, m) => {
						const start = `${year}-${pad(m + 1)}-01`;
						const last = new Date(year, m + 1, 0).getDate();
						const end = `${year}-${pad(m + 1)}-${pad(last)}`;
						return {
							label: `${m + 1}月`,
							title: `${m + 1} 月`,
							start,
							end,
							count: doneIn(start, end).length
						};
					});
				}
				if (ui.statsPeriod === "month") {
					const out = [];
					let cursor = startOfWeek(range.start);
					let index = 1;
					while (cursor <= range.end) {
						const bucketStart = cursor < range.start ? range.start : cursor;
						const bucketEnd = addDays(cursor, 6) > range.end ? range.end : addDays(cursor, 6);
						out.push({
							label: `${parseDate(bucketStart).getMonth() + 1}/${parseDate(bucketStart).getDate()}`,
							title: `第 ${index} 周`,
							start: bucketStart,
							end: bucketEnd,
							count: doneIn(bucketStart, bucketEnd).length
						});
						cursor = addDays(cursor, 7);
						index += 1;
					}
					return out;
				}
				return Array.from({ length: 7 }, (_, i) => addDays(range.start, i)).map((d) => ({
					label: `${parseDate(d).getMonth() + 1}/${parseDate(d).getDate()}`,
					title: weekdayName(d),
					start: d,
					end: d,
					count: doneIn(d, d).length
				}));
			}
			function streak() {
				const dates = new Set(db.tasks.filter((t) => doneOf(t) && matchProject(t)).map((t) => stampDate(doneAt(t))).filter(Boolean));
				let n = 0;
				let cursor = todayKey();
				while (dates.has(cursor)) {
					n += 1;
					cursor = addDays(cursor, -1);
				}
				return n;
			}
			function renderStats() {
				const range = statsRange();
				const buckets = trendBuckets(range);
				const weekDone = doneIn(range.start, range.end);
				const planned = db.tasks.filter((t) => matchProject(t) && inRange(t.date, range.start, range.end));
				const rate = planned.length > 0 ? Math.round(planned.filter((t) => doneOf(t)).length / planned.length * 100) : 0;
				const max = Math.max(1, ...buckets.map((s) => s.count));
				const focus = todayFocus();
				const bySpace = db.spaces.map((sp) => ({
					sp,
					n: weekDone.filter((t) => t.space === sp.id).length
				})).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
				const topSpace = bySpace[0];
				const busiest = buckets.reduce((a, b) => b.count > a.count ? b : a, buckets[0]);
				const withSubs = db.tasks.filter((t) => t.subtasks.length > 0 && matchProject(t)).length;
				const waiting = db.tasks.filter((t) => t.status === "waiting" && matchProject(t)).length;
				const streakDays = streak();
				const period = ui.statsPeriod;
				return `<div class="view-head"><div><div class="eyebrow">数据复盘</div><h1 class="page-title">统计</h1>
      <div class="page-sub">用同一套任务数据复盘每天、每周、每月与全年${ui.project === "all" ? "" : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div>
      <div class="head-tools">${projectSelect()}<div class="mini-seg">${[
					"week",
					"month",
					"year"
				].map((p) => `<button data-act="stats-period" data-period="${p}" class="${period === p ? "active" : ""}">${p === "week" ? "本周" : p === "month" ? "本月" : "本年"}</button>`).join("")}</div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="k-top">${ic("check", 12)}${range.label}实际完成</div><div class="k-num">${weekDone.length}<span class="k-unit"> 次</span></div><div class="k-sub">涉及 ${new Set(weekDone.map((t) => t.id)).size} 项任务</div></div>
        <div class="kpi"><div class="k-top">${ic("target", 12)}今日专注</div><div class="k-num">${focus.minutes}<span class="k-unit"> 分钟</span></div><div class="k-sub">${focus.rounds} 轮 · 会话累计</div></div>
        <div class="kpi"><div class="k-top">${ic("spark", 12)}连续完成</div><div class="k-num">${streakDays}<span class="k-unit"> 天</span></div><div class="k-sub">${streakDays > 0 ? "保持每天完成至少 1 项" : "完成一项任务即可开始"}</div></div>
        <div class="kpi"><div class="k-top">${ic("chart", 12)}${range.label}计划完成率</div><div class="k-num">${rate}<span class="k-unit"> %</span></div><div class="k-sub">${planned.filter((t) => doneOf(t)).length} / ${planned.length} 项计划</div></div>
      </div>
      <div class="stats-grid">
        <div class="panel"><div class="panel-h">${range.label}完成趋势<span class="n">合计 ${weekDone.length} 次</span></div>
          <div class="panel-sub">按任务完成时间统计，不按计划日期归档</div>
          <div class="chart">${buckets.map((b) => `<div class="bar-col" title="${esc(b.title)}"><div class="bar" style="height:${b.count === 0 ? 2 : Math.max(8, b.count / max * 100)}%;${b.count === 0 ? "opacity:.25" : ""}"><span>${b.count}次</span></div></div>`).join("")}</div>
          <div class="bar-x">${buckets.map((b) => `<div>${b.label}</div>`).join("")}</div>
        </div>
        <div class="panel"><div class="panel-h">空间完成结构<span class="n">${range.label}</span></div>
          <div class="panel-sub">按空间统计已完成的次数</div>
          <div class="structure">
            <div class="struct-nums">${bySpace.slice(0, 2).map((x) => `<div><b style="color:${x.sp.color}">${x.n}</b><span>${esc(x.sp.name)}完成次数</span></div>`).join("") || "<div><b>0</b><span>本期暂无完成</span></div>"}</div>
            <div class="struct-bar">${bySpace.map((x) => `<i style="width:${weekDone.length > 0 ? x.n / weekDone.length * 100 : 0}%;background:${x.sp.color}"></i>`).join("")}</div>
            <div class="muted" style="font-size:10.5px">${topSpace ? `本期 ${topSpace.n} 次完成来自${esc(topSpace.sp.name)}空间` : "本期还没有完成任务"}</div>
          </div>
        </div>
      </div>
      <div class="insights">
        <div class="insight"><div class="ii">${ic("flag", 13)}</div><div><b>${esc(busiest.title)}完成最多</b><span>完成 ${busiest.count} 项任务</span></div></div>
        <div class="insight"><div class="ii">${ic("layers", 13)}</div><div><b>${withSubs} 项任务已拆步骤</b><span>共 ${db.tasks.reduce((sum, t) => sum + t.subtasks.length, 0)} 个子待办</span></div></div>
        <div class="insight"><div class="ii">${ic("clock", 13)}</div><div><b>${waiting} 项任务在等待</b><span>等待外部条件，不占用今天</span></div></div>
        <div class="insight"><div class="ii">${ic("spark", 13)}</div><div><b>${focus.rounds} 轮专注</b><span>今天专注 ${focus.minutes} 分钟</span></div></div>
        <div class="insight"><div class="ii">${ic("checkSquare", 13)}</div><div><b>${streakDays} 天连续完成</b><span>${streakDays > 1 ? "保持住这个节奏" : "从今天开始积累"}</span></div></div>
      </div>
      <div class="footnote">实际完成按任务完成时间归期；${range.label}从 ${range.start} 到 ${range.end}。计划完成率只统计计划日期落在本期内的任务。</div>`;
			}
			const NEWS_KIND_LABEL = {
				daily: "每天",
				workdays: "工作日",
				weekly: "每周",
				custom: "自定义"
			};
			const WEEKDAY_LABEL = [
				"周日",
				"周一",
				"周二",
				"周三",
				"周四",
				"周五",
				"周六"
			];
			const NEWS_PRESETS = [
				{
					title: "AI 行业动态",
					query: "AI 大模型 最新新闻 发布"
				},
				{
					title: "科技产品",
					query: "手机 芯片 新品 发布 科技"
				},
				{
					title: "财经市场",
					query: "股市 经济 央行 政策 市场"
				},
				{
					title: "国际时事",
					query: "国际 地缘 外交 冲突 局势"
				},
				{
					title: "健康生活",
					query: "健康 医疗 研究 生活方式"
				},
				{
					title: "体育赛事",
					query: "体育 赛事 比赛 冠军"
				},
				{
					title: "游戏动漫",
					query: "游戏 动漫 新作 发布"
				},
				{
					title: "开源项目",
					query: "GitHub 开源 项目 发布"
				}
			];
			function parseTimeList(text) {
				const out = [];
				for (const raw of text.split(/[,，、;；\s]+/)) {
					const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
					if (!m) continue;
					const h = Number(m[1]);
					const min = Number(m[2]);
					if (h < 0 || h > 23 || min < 0 || min > 59) continue;
					out.push(`${pad(h)}:${pad(min)}`);
				}
				return Array.from(new Set(out)).sort();
			}
			function shortHash(text) {
				let h = 5381;
				for (let i = 0; i < text.length; i += 1) h = (h << 5) + h + text.charCodeAt(i) | 0;
				return Math.abs(h).toString(36).slice(0, 7);
			}
			function cronOfTime(time, kind, weekday, customCron) {
				if (kind === "custom") return customCron.trim();
				const [h, m] = time.split(":").map(Number);
				const mm = Number.isFinite(m) ? m : 0;
				const hh = Number.isFinite(h) ? h : 8;
				if (kind === "workdays") return `${mm} ${hh} * * 1-5`;
				if (kind === "weekly") return `${mm} ${hh} * * ${Math.max(0, Math.min(6, weekday))}`;
				return `${mm} ${hh} * * *`;
			}
			function schedulesOf(kind, times, weekday, customCron) {
				if (kind === "custom") return customCron.trim() === "" ? [] : [customCron.trim()];
				return times.map((t) => cronOfTime(t, kind, weekday, customCron));
			}
			function scheduleTextOf(kind, times, weekday, customCron) {
				if (kind === "custom") return `自定义：${customCron.trim()}`;
				return `${kind === "daily" ? "每天" : kind === "workdays" ? "工作日" : `每${WEEKDAY_LABEL[weekday]}`} ${times.join(" · ")}`;
			}
			function topicStatus(topic) {
				const started = newsRunning[topic.id];
				if (started !== void 0 && Date.now() - started < 24e4) return {
					label: "检索中",
					cls: "green"
				};
				if (!cronAvailable) return {
					label: "未连接",
					cls: "amber"
				};
				if (!topic.enabled) return {
					label: "已暂停",
					cls: "gray"
				};
				const tasks = topic.cronTaskIds.map((id) => cronTasks.find((t) => t.id === id)).filter(Boolean);
				if (tasks.length === 0) return {
					label: "未同步",
					cls: "amber"
				};
				const paused = tasks.filter((t) => t.status === "paused").length;
				if (paused === tasks.length) return {
					label: "已暂停",
					cls: "gray"
				};
				if (paused > 0) return {
					label: "部分暂停",
					cls: "amber"
				};
				return {
					label: "活跃",
					cls: "green"
				};
			}
			function topicNextRun(topic) {
				let next = null;
				for (const id of topic.cronTaskIds) {
					const at = cronTasks.find((t) => t.id === id)?.nextRunAt;
					if (typeof at === "number" && at > 0 && (next === null || at < next)) next = at;
				}
				return next;
			}
			function fmtWhen(ms) {
				if (ms === null || !Number.isFinite(ms) || ms <= 0) return "未安排";
				const d = new Date(ms);
				return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
			}
			function ago(stamp) {
				if (!stamp) return "";
				const t = Date.parse(stamp.replace(" ", "T"));
				if (!Number.isFinite(t)) return stamp;
				const diff = Date.now() - t;
				if (diff < 6e4) return "刚刚";
				if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
				if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
				if (diff < 6048e5) return `${Math.floor(diff / 864e5)} 天前`;
				return stamp.slice(0, 10);
			}
			function newsPrompt(topic) {
				return `你是「个人工作台」的新闻检索助手。\n订阅主题：${topic.title}\n检索关键词：${topic.query}\n\n请检索最近 24–48 小时与关键词相关的最新新闻，优先中文来源；最多 ${Math.max(1, Math.min(20, topic.count || 6))} 条，只保留可核实的可靠来源。\n为每条整理：\n- title：准确标题或准确译名\n- source：媒体名\n- url：http/https 原文链接（不得编造）\n- publishedAt：YYYY-MM-DD（未知可留空）\n- summary：中文一句话，不超过 60 字\n- aiSummary：AI 总结，100–180 字中文，说明发生了什么、关键数据/观点、对行业或读者的影响；这是卡片上展示的正文，不要写成关键词堆砌\n\n不要编造 URL、标题或日期；同一事件合并。\n完成后必须调用工具 workbench_news_publish，参数：\n{"topicId":"${topic.id}","items":[...]}\n没有合适新闻时也调用一次，items 传空数组。不要输出其他内容。`;
			}
			async function cronFetch(path, init) {
				const res = await fetch(`/dsh-cron${path}`, {
					...init,
					headers: {
						...init?.body !== void 0 ? { "content-type": "application/json" } : {},
						...init?.headers ?? {}
					}
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `HTTP ${res.status}`);
				return data;
			}
			async function syncCronForTopic(topic, previousIds) {
				const schedules = schedulesOf(topic.scheduleKind, topic.times, topic.weekday, topic.customCron);
				if (schedules.length === 0) throw new Error("请至少填写一个检索时间或 cron 表达式");
				const created = [];
				try {
					for (const schedule of schedules) {
						const id = `workbench-news-${topic.id}-${shortHash(schedule)}`;
						const body = {
							id,
							title: `工作台新闻 · ${topic.title} · ${schedule}`,
							schedule,
							type: "llm",
							prompt: newsPrompt(topic),
							delivery: "isolated",
							channels: [],
							timezone: "Asia/Shanghai",
							timeoutSeconds: 900,
							maxRetries: 1,
							overlapPolicy: "skip",
							misfirePolicy: "skip",
							permissionPreset: "read-only",
							sessionTitle: `工作台新闻 · ${topic.title}`
						};
						await cronFetch("/tasks", {
							method: "POST",
							body: JSON.stringify(body)
						});
						created.push(id);
						await cronFetch(`/tasks/${encodeURIComponent(id)}/${topic.enabled ? "resume" : "pause"}`, { method: "POST" });
					}
				} catch (cause) {
					for (const id of created) try {
						await cronFetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
					} catch {}
					throw cause;
				}
				for (const id of previousIds) if (!created.includes(id)) try {
					await cronFetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
				} catch {}
				return created;
			}
			async function loadNews(silent = false) {
				if (!loaded) return;
				lastNewsPoll = Date.now();
				if (!silent) {
					ui.newsLoading = true;
					ui.newsError = "";
					if (ui.view === "news") renderContent();
				}
				try {
					const res = await fetch(`${API}/news`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					newsTopics = Array.isArray(data.topics) ? data.topics : [];
					newsItems = Array.isArray(data.items) ? data.items : [];
					ui.newsError = "";
				} catch (cause) {
					ui.newsError = String(cause.message ?? cause);
				}
				try {
					const data = await cronFetch("/tasks");
					cronTasks = Array.isArray(data.tasks) ? data.tasks : [];
					cronAvailable = true;
				} catch (cause) {
					cronAvailable = false;
					String(cause.message ?? cause);
					cronTasks = [];
				}
				for (const topic of newsTopics) {
					const started = newsRunning[topic.id];
					if (started !== void 0) {
						const at = topic.lastRunAt ? Date.parse(topic.lastRunAt.replace(" ", "T")) : NaN;
						const taskDone = topic.cronTaskIds.some((id) => {
							const last = cronTasks.find((t) => t.id === id)?.lastRunAt;
							return typeof last === "number" && last >= started;
						});
						if (Number.isFinite(at) && at >= started || taskDone) delete newsRunning[topic.id];
						else if (Date.now() - started > 24e4) delete newsRunning[topic.id];
					}
				}
				ui.newsLoading = false;
				if (ui.view !== "news") return;
				const sig = JSON.stringify({
					t: newsTopics.map((t) => [
						t.id,
						t.updatedAt,
						t.lastRunAt,
						t.enabled
					]),
					i: newsItems.map((i) => i.id),
					c: cronTasks.map((t) => [
						t.id,
						t.status,
						t.lastRunAt,
						t.nextRunAt
					]),
					r: Object.keys(newsRunning)
				});
				if (!silent || sig !== newsSig) {
					newsSig = sig;
					const scrollTop = silent ? content()?.scrollTop ?? 0 : 0;
					renderContent();
					if (silent && content() !== null) content().scrollTop = scrollTop;
				}
			}
			function renderNews() {
				const topics = newsTopics.slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.createdAt.localeCompare(b.createdAt));
				const filtered = ui.newsTopicFilter === "all" ? newsItems : newsItems.filter((i) => i.topicId === ui.newsTopicFilter);
				const today = todayKey();
				const todayCount = newsItems.filter((i) => i.fetchedAt.slice(0, 10) === today).length;
				const newest = newsItems[0]?.fetchedAt ?? "";
				const head = `<div class="view-head"><div><div class="eyebrow">新闻检索</div><h1 class="page-title">新闻</h1>
      <div class="page-sub">按主题与时间用 DSH Agent 检索，结果只保存在本机</div></div>
      <div style="display:flex;gap:7px;align-items:center">
        <button class="btn" data-act="news-refresh">${ic("refresh", 13)}刷新</button>
        <button class="btn-primary" data-act="news-add">${ic("plus", 14)}订阅主题</button>
      </div></div>`;
				const banner = !cronAvailable ? `<div class="news-banner">${ic("flag", 13)}<span>未检测到 <code>/dsh-cron/tasks</code>：请确认已安装 @goodandready/dsh-cron。新闻订阅可以展示，但无法创建/运行定时任务。</span><button class="btn" data-act="news-refresh">重试</button></div>` : "";
				const stats = `<div class="news-stats">
      <span><b>${topics.length}</b> 个订阅</span>
      <span><b>${newsItems.length}</b> 条新闻</span>
      <span><b>${todayCount}</b> 条今日入库</span>
      <span class="muted">最近更新 ${newest ? ago(newest) : "—"}${ui.newsLoading ? " · 同步中…" : ""}</span>
      ${ui.newsError ? `<span style="color:var(--red)">${esc(ui.newsError)}</span>` : ""}
    </div>`;
				const topicCards = topics.length === 0 ? "" : `<div class="news-topics">${topics.map((topic) => {
					const status = topicStatus(topic);
					const next = topicNextRun(topic);
					const taskCount = topic.cronTaskIds.length;
					return `<div class="news-topic-card">
        <div class="nt-top"><b>${esc(topic.title)}</b><span class="pill ${status.cls}">${status.label}</span></div>
        <div class="nt-query">${ic("search", 11)} ${esc(topic.query)}</div>
        <div class="nt-meta">${ic("clock", 11)} ${esc(topic.scheduleText || scheduleTextOf(topic.scheduleKind, topic.times, topic.weekday, topic.customCron))} · 每次 ${topic.count ?? 6} 条 · ${taskCount} 个任务</div>
        <div class="nt-meta">${ic("calendar", 11)} 下次 ${fmtWhen(next)} · 上次入库 ${topic.lastRunAt ? ago(topic.lastRunAt) : "—"}</div>
        <div class="nt-actions">
          <button class="btn" data-act="news-run" data-id="${topic.id}" title="立即检索">${ic("play", 12)}检索</button>
          <button class="btn" data-act="news-toggle" data-id="${topic.id}" title="${topic.enabled ? "暂停" : "恢复"}">${topic.enabled ? ic("pause", 12) : ic("play", 12)}${topic.enabled ? "暂停" : "恢复"}</button>
          <button class="icon-btn" data-act="news-edit" data-id="${topic.id}" title="编辑">${ic("edit", 14)}</button>
          <button class="icon-btn" data-act="news-delete" data-id="${topic.id}" title="删除">${ic("trash", 14)}</button>
        </div>
      </div>`;
				}).join("")}</div>`;
				const filters = topics.length === 0 ? "" : `<div class="news-filters">
      <button class="chip ${ui.newsTopicFilter === "all" ? "active" : ""}" data-act="news-filter" data-topic="all">全部</button>
      ${topics.map((t) => `<button class="chip ${ui.newsTopicFilter === t.id ? "active" : ""}" data-act="news-filter" data-topic="${t.id}">${esc(t.title)}</button>`).join("")}
    </div>`;
				const accents = [
					"var(--accent)",
					"var(--green)",
					"var(--amber)",
					"var(--blue)"
				];
				const accentOf = (topicId) => {
					let h = 0;
					for (let i = 0; i < topicId.length; i += 1) h = h * 31 + topicId.charCodeAt(i) | 0;
					return accents[Math.abs(h) % accents.length] ?? accents[0];
				};
				const itemHtml = (item) => {
					const topic = newsTopics.find((t) => t.id === item.topicId);
					const ai = (item.aiSummary || "").trim();
					const text = ai || (item.summary || "").trim();
					return `<article class="news-item" style="--card-accent:${accentOf(item.source || item.id)}">
        <div class="ni-meta"><span class="news-topic-tag">${esc(topic?.title ?? "新闻")}</span>
          <span style="margin-left:auto">${ago(item.fetchedAt)}</span></div>
        <a class="ni-title" href="${esc(item.url)}" target="_blank" rel="noreferrer noopener">${esc(item.title)} ${ic("external", 12)}</a>
        ${text ? `<div class="ni-ai${ai ? "" : " plain"}"><div class="ni-ai-head">${ic("spark", 11)} ${ai ? "AI 总结" : "摘要"}</div><p>${esc(text)}</p></div>` : ""}
        <div class="ni-foot">${item.source ? `<span>${esc(item.source)}</span>` : ""}${item.publishedAt ? `<span>${esc(item.publishedAt)}</span>` : ""}<a href="${esc(item.url)}" target="_blank" rel="noreferrer noopener">查看原文</a></div>
      </article>`;
				};
				const feed = topics.length === 0 ? `<div class="news-empty"><div class="ne-icon">${ic("news", 22)}</div><b>还没有新闻订阅</b><span>选一个预置主题，或自己填关键词与检索时间；DSH 到点会用 Agent 搜索并把结果写回这里。</span><div class="news-presets" style="justify-content:center;margin:4px 0 2px">${NEWS_PRESETS.map((p, i) => `<button class="chip" data-act="news-preset" data-index="${i}">${esc(p.title)}</button>`).join("")}</div><button class="btn-primary" data-act="news-add" style="margin-top:4px">${ic("plus", 14)}自定义订阅</button></div>` : `<div class="news-feed-head"><b>最新新闻</b><span class="muted">${filtered.length} 条${ui.newsTopicFilter === "all" ? "" : " · 已按主题筛选"}</span></div>
        ${filters}
        ${filtered.length === 0 ? `<div class="news-empty small"><b>还没有检索结果</b><span>等待下一次定时任务，或点上方订阅卡片的「检索」立即运行一次。</span></div>` : `<div class="news-list">${filtered.map(itemHtml).join("")}</div>`}`;
				return head + banner + stats + topicCards + feed;
			}
			function openNewsTopic(topic, preset) {
				const editing = topic !== void 0;
				const kind = topic?.scheduleKind ?? "daily";
				const times = topic?.times?.join(", ") ?? "08:30";
				const count = topic?.count ?? 6;
				openModal(`<h3>${editing ? "编辑新闻订阅" : "新建新闻订阅"}</h3>
      ${editing ? "" : `<div class="mfield"><label>快速主题（可再改）</label><div class="news-presets">${NEWS_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.title)}</button>`).join("")}</div></div>`}
      <div class="mfield"><label>主题名称</label><input id="wb-news-title" value="${esc(topic?.title ?? preset?.title ?? "")}" placeholder="例如：AI 行业动态"></div>
      <div class="mfield"><label>检索关键词</label><input id="wb-news-query" value="${esc(topic?.query ?? preset?.query ?? "")}" placeholder="例如：大模型 发布 融资 开源"></div>
      <div class="mrow"><div class="mfield"><label>频率</label><select id="wb-news-kind">${[
					"daily",
					"workdays",
					"weekly",
					"custom"
				].map((k) => `<option value="${k}" ${kind === k ? "selected" : ""}>${NEWS_KIND_LABEL[k]}</option>`).join("")}</select></div>
        <div class="mfield"><label>每次检索条数</label><select id="wb-news-count">${[
					3,
					5,
					6,
					8,
					10,
					15,
					20
				].map((n) => `<option value="${n}" ${Number(count) === n ? "selected" : ""}>${n} 条</option>`).join("")}</select></div></div>
      <div class="mrow"><div class="mfield"><label>每周几（仅「每周」）</label><select id="wb-news-weekday">${WEEKDAY_LABEL.map((w, i) => `<option value="${i}" ${(topic?.weekday ?? 1) === i ? "selected" : ""}>${w}</option>`).join("")}</select></div>
        <div class="mfield"><label>启用定时检索</label><div style="padding-top:5px"><button class="switch ${topic?.enabled ?? true ? "on" : ""}" data-act="news-toggle-enabled" id="wb-news-enabled" style="margin:0"></button></div></div></div>
      <div class="mfield"><label>检索时间（可多个，用逗号分隔）</label><input id="wb-news-times" value="${esc(times)}" placeholder="08:30, 20:00"></div>
      <div class="mfield"><label>自定义 cron（频率选「自定义」时使用）</label><input id="wb-news-cron" value="${esc(topic?.customCron ?? "")}" placeholder="30 8,20 * * *"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">每个检索时间会创建一个 dsh-cron 任务。到点后 DSH Agent 用网页搜索整理新闻，并通过 workbench_news_publish 写回本机；每次检索会请求 AI 总结并展示在卡片上。检索会消耗模型额度；权限只读。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="news-save" data-id="${topic?.id ?? ""}">${editing ? "保存修改" : "创建订阅"}</button></div>`);
				let enabled = topic?.enabled ?? true;
				shadow.querySelector("#wb-news-enabled")?.addEventListener("click", (event) => {
					event.stopPropagation();
					enabled = !enabled;
					event.currentTarget.classList.toggle("on", enabled);
				});
				shadow.querySelectorAll("[data-preset]").forEach((button) => {
					button.addEventListener("click", () => {
						const p = NEWS_PRESETS[Number(button.getAttribute("data-preset"))];
						const title = $id("wb-news-title");
						const query = $id("wb-news-query");
						if (p && title && query) {
							title.value = p.title;
							query.value = p.query;
							title.focus();
						}
					});
				});
			}
			async function saveNewsFromModal(existingId) {
				const title = $id("wb-news-title")?.value.trim() ?? "";
				const query = $id("wb-news-query")?.value.trim() || title;
				const kind = $id("wb-news-kind")?.value ?? "daily";
				const times = parseTimeList($id("wb-news-times")?.value ?? "");
				const weekday = Number($id("wb-news-weekday")?.value ?? 1);
				const customCron = $id("wb-news-cron")?.value.trim() ?? "";
				const enabled = $id("wb-news-enabled")?.classList.contains("on") ?? true;
				const count = Math.max(1, Math.min(20, Number($id("wb-news-count")?.value ?? 6) || 6));
				if (title === "") {
					toast("请填写主题名称");
					return;
				}
				if (kind !== "custom" && times.length === 0) {
					toast("请填写至少一个 HH:mm 时间");
					return;
				}
				if (kind === "custom" && customCron.split(/\s+/).filter(Boolean).length !== 5) {
					toast("cron 需要 5 段，例如 30 8,20 * * *");
					return;
				}
				const previous = newsTopics.find((t) => t.id === existingId);
				const draft = {
					id: previous?.id ?? `news-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
					title,
					query,
					scheduleKind: kind,
					times,
					weekday,
					customCron,
					scheduleText: scheduleTextOf(kind, times, weekday, customCron),
					cronTaskIds: previous?.cronTaskIds ?? [],
					enabled,
					count,
					lastRunAt: previous?.lastRunAt ?? null,
					createdAt: previous?.createdAt ?? nowStamp(),
					updatedAt: nowStamp()
				};
				let createdIds = [];
				try {
					createdIds = await syncCronForTopic(draft, previous?.cronTaskIds ?? []);
					draft.cronTaskIds = createdIds;
					const res = await fetch(`${API}/news/topics`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ topic: draft })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					closeModal();
					await loadNews();
					toast(previous ? "订阅已更新" : "订阅已创建");
				} catch (cause) {
					for (const taskId of createdIds) try {
						await cronFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
					} catch {}
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			async function runNewsTopic(id) {
				const topic = newsTopics.find((t) => t.id === id);
				if (!topic) return;
				if (topic.cronTaskIds.length === 0) {
					toast("这个订阅还没有同步到定时任务，请先编辑保存一次");
					return;
				}
				newsRunning[id] = Date.now();
				newsWatchUntil = Date.now() + 24e4;
				lastNewsPoll = 0;
				renderContent();
				toast("已触发检索，Agent 完成后会自动刷新");
				try {
					await cronFetch(`/tasks/${encodeURIComponent(topic.cronTaskIds[0])}/run`, { method: "POST" });
				} catch (cause) {
					delete newsRunning[id];
					renderContent();
					toast(`触发失败：${String(cause.message ?? cause)}`);
				}
			}
			async function toggleNewsTopic(id) {
				const topic = newsTopics.find((t) => t.id === id);
				if (!topic) return;
				if (topic.cronTaskIds.length === 0) {
					toast("订阅未同步，请先编辑保存");
					return;
				}
				const next = !topic.enabled;
				try {
					for (const taskId of topic.cronTaskIds) await cronFetch(`/tasks/${encodeURIComponent(taskId)}/${next ? "resume" : "pause"}`, { method: "POST" });
					topic.enabled = next;
					await fetch(`${API}/news/topics`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ topic })
					});
					await loadNews();
					toast(next ? "已恢复定时检索" : "已暂停定时检索");
				} catch (cause) {
					toast(`操作失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteNewsTopic(id) {
				const topic = newsTopics.find((t) => t.id === id);
				if (!topic) return;
				if (!(typeof window.confirm === "function" ? window.confirm(`删除订阅「${topic.title}」及其全部新闻？`) : true)) return;
				for (const taskId of topic.cronTaskIds) try {
					await cronFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
				} catch {}
				try {
					const res = await fetch(`${API}/news/topics/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					if (ui.newsTopicFilter === id) ui.newsTopicFilter = "all";
					delete newsRunning[id];
					await loadNews();
					toast("订阅已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function noteById(id) {
				return notes.find((n) => n.id === id);
			}
			function noteText(content) {
				return content.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~\[\]()]/g, " ").replace(/\s+/g, " ").trim();
			}
			function noteWords(content) {
				return content.replace(/\s/g, "").length;
			}
			function markdownInline(text) {
				let out = esc(text);
				out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
				out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
				out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
				out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
				out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "<img alt=\"$1\" src=\"$2\" loading=\"lazy\">");
				out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer noopener\">$1</a>");
				return out;
			}
			function markdownToHtml(md) {
				const lines = md.replace(/\r\n?/g, "\n").split("\n");
				let html = "";
				let list = null;
				let inCode = false;
				let codeLang = "";
				let code = [];
				const closeList = () => {
					if (list !== null) {
						html += `</${list}>`;
						list = null;
					}
				};
				const openList = (kind) => {
					if (list !== kind) {
						closeList();
						html += `<${kind}>`;
						list = kind;
					}
				};
				for (let li = 0; li < lines.length; li += 1) {
					const line = lines[li];
					if (/^```/.test(line.trim())) {
						if (inCode) {
							html += `<pre><code${codeLang ? ` class="language-${esc(codeLang)}"` : ""}>${esc(code.join("\n"))}</code></pre>`;
							inCode = false;
							codeLang = "";
							code = [];
						} else {
							inCode = true;
							codeLang = line.trim().slice(3).trim();
						}
						continue;
					}
					if (inCode) {
						code.push(line);
						continue;
					}
					if (line.trim() === "") {
						closeList();
						continue;
					}
					if (/^-{3,}$/.test(line.trim())) {
						closeList();
						html += "<hr>";
						continue;
					}
					const heading = line.match(/^(#{1,6})\s+(.*)$/);
					if (heading) {
						closeList();
						const n = heading[1].length;
						html += `<h${n}>${markdownInline(heading[2])}</h${n}>`;
						continue;
					}
					if (/^>\s?/.test(line)) {
						closeList();
						html += `<blockquote>${markdownInline(line.replace(/^>\s?/, ""))}</blockquote>`;
						continue;
					}
					const ul = line.match(/^\s*[-*+]\s+(.*)$/);
					if (ul) {
						openList("ul");
						const task = ul[1].match(/^\[([ xX])\]\s+(.*)$/);
						html += task ? `<li class="md-task"><span class="md-check">${task[1].toLowerCase() === "x" ? "☑" : "☐"}</span> ${markdownInline(task[2])}</li>` : `<li>${markdownInline(ul[1])}</li>`;
						continue;
					}
					const ol = line.match(/^\s*\d+\.\s+(.*)$/);
					if (ol) {
						openList("ol");
						html += `<li>${markdownInline(ol[1])}</li>`;
						continue;
					}
					if (/^\s*\|.*\|\s*$/.test(line)) {
						const next = lines[li + 1] ?? "";
						const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => markdownInline(c.trim()));
						if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(next)) {
							closeList();
							html += `<table><thead><tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
							li += 2;
							while (li < lines.length && /^\s*\|.*\|\s*$/.test(lines[li])) {
								const tds = lines[li].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => markdownInline(c.trim()));
								html += `<tr>${tds.map((c) => `<td>${c}</td>`).join("")}</tr>`;
								li += 1;
							}
							li -= 1;
							html += "</tbody></table>";
							continue;
						}
					}
					closeList();
					html += `<p>${markdownInline(line)}</p>`;
				}
				if (inCode) html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
				closeList();
				return html === "" ? "<p class=\"muted\">还没有内容。</p>" : html;
			}
			function notebookOf(id) {
				return notebooks.find((nb) => nb.id === id);
			}
			function notebookName(id) {
				return notebookOf(id)?.name ?? "未分类";
			}
			function defaultNotebook() {
				return notebooks[0];
			}
			function noteMatches(note) {
				const q = ui.notesQ.trim().toLowerCase();
				if (noteNotebookFilter !== "all" && (note.notebookId ?? "") !== noteNotebookFilter) return false;
				if (ui.notesFilter === "pinned" && !note.pinned) return false;
				if (ui.notesFilter.startsWith("tag:") && !note.tags.includes(ui.notesFilter.slice(4))) return false;
				if (q === "") return true;
				return `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(q);
			}
			function sortedNotes() {
				return notes.filter(noteMatches).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
			}
			function noteListHtml() {
				const list = sortedNotes();
				if (noteLoading && notes.length === 0) return "<div class=\"notes-empty small\">正在读取笔记…</div>";
				if (list.length === 0) return "<div class=\"notes-empty small\">没有匹配的笔记</div>";
				return list.map((note) => {
					const text = noteText(note.content);
					return `<div class="note-row${note.id === noteSelected ? " active" : ""}" data-note-id="${note.id}">
        <div class="note-row-top"><span class="note-row-title">${note.pinned ? ic("pin", 11) : ""}${esc(note.title || "未命名笔记")}</span><span class="note-row-time">${ago(note.updatedAt)}</span></div>
        <div class="note-row-snip">${esc(text.slice(0, 90) || "空白笔记")}</div>
        <div class="note-row-tags"><span class="note-row-nb">${esc(notebookName(note.notebookId))}</span>${note.tags.slice(0, 2).map((tag) => `<span>#${esc(tag)}</span>`).join("")}</div>
      </div>`;
				}).join("");
			}
			function renderNoteListOnly() {
				const list = $id("wb-note-list");
				if (list !== null) list.innerHTML = noteListHtml();
			}
			function noteSaveText() {
				if (noteSaveState === "saving") return "保存中…";
				if (noteSaveState === "error") return "保存失败";
				return "已保存";
			}
			function updateNoteSaveStatus() {
				const node = $id("wb-note-save");
				if (node !== null) {
					node.textContent = noteSaveText();
					node.className = `note-save-state${noteSaveState === "error" ? " err" : noteSaveState === "saving" ? " busy" : ""}`;
				}
			}
			function updateNoteWords() {
				const note = noteById(noteSelected);
				const node = $id("wb-note-words");
				if (note && node) node.textContent = `${noteWords(note.content)} 字`;
			}
			function scheduleNoteSave() {
				noteDirty = true;
				noteChangeSeq += 1;
				noteSaveState = "saving";
				updateNoteSaveStatus();
				if (noteSaveTimer !== 0) window.clearTimeout(noteSaveTimer);
				noteSaveTimer = window.setTimeout(() => {
					saveSelectedNote();
				}, 650);
			}
			async function saveSelectedNote() {
				const note = noteById(noteSelected);
				if (!note || !noteDirty) return;
				if (noteSaveTimer !== 0) {
					window.clearTimeout(noteSaveTimer);
					noteSaveTimer = 0;
				}
				if (note.title.trim() === "") {
					note.title = "未命名笔记";
					const input = $id("wb-note-title");
					if (input !== null) input.value = note.title;
				}
				const seq = noteChangeSeq;
				noteSaveState = "saving";
				updateNoteSaveStatus();
				try {
					const res = await fetch(`${API}/notes`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ note: {
							id: note.id,
							notebookId: note.notebookId,
							title: note.title,
							content: note.content,
							tags: note.tags,
							pinned: note.pinned
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					if (data.note) {
						if (seq === noteChangeSeq) Object.assign(note, data.note);
						else note.updatedAt = data.note.updatedAt;
					}
					if (seq === noteChangeSeq) {
						noteDirty = false;
						noteSaveState = "saved";
					} else {
						noteSaveState = "saving";
						scheduleNoteSave();
					}
					updateNoteSaveStatus();
					renderNoteListOnly();
					const foot = $id("wb-note-updated");
					if (foot) foot.textContent = `更新于 ${ago(note.updatedAt)}`;
				} catch (cause) {
					noteSaveState = "error";
					updateNoteSaveStatus();
					console.warn("[dsh-workbench] 笔记保存失败", cause);
				}
			}
			async function flushNoteSave() {
				if (noteDirty) await saveSelectedNote();
			}
			async function loadNotes(silent = false) {
				if (noteLoading) return;
				noteLoading = true;
				if (!silent) {
					noteError = "";
					if (ui.view === "notes") renderContent();
				}
				try {
					const res = await fetch(`${API}/notes`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					const nextNotes = Array.isArray(data.notes) ? data.notes : [];
					if (silent) {
						if (noteDirty) {
							noteLoading = false;
							return;
						}
						const before = noteById(noteSelected)?.updatedAt;
						notes = nextNotes;
						const after = noteById(noteSelected)?.updatedAt;
						if (before !== void 0 && after !== void 0 && before !== after) {
							renderContent();
							toast("AI 已更新当前笔记，已自动载入");
						}
					} else notes = nextNotes;
					notebooks = Array.isArray(data.notebooks) ? data.notebooks : [];
					if (noteNotebookFilter !== "all" && notebookOf(noteNotebookFilter) === void 0) noteNotebookFilter = "all";
					if (noteSelected === null || noteById(noteSelected) === void 0) noteSelected = sortedNotes()[0]?.id ?? notes[0]?.id ?? null;
					if (!silent) {
						noteSaveState = "saved";
						noteDirty = false;
					}
				} catch (cause) {
					if (!silent) noteError = String(cause.message ?? cause);
				}
				noteLoading = false;
				if (!silent && ui.view === "notes") renderContent();
			}
			async function selectNote(id) {
				if (id === noteSelected) return;
				await flushNoteSave();
				if (noteSaveState === "error") {
					toast("当前笔记保存失败，先不切换");
					return;
				}
				noteSelected = id;
				ui.noteMode = "edit";
				noteDirty = false;
				noteSaveState = "saved";
				renderContent();
			}
			async function createNote() {
				await flushNoteSave();
				if (noteSaveState === "error") {
					toast("当前笔记保存失败，先不新建");
					return;
				}
				try {
					const res = await fetch(`${API}/notes`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ note: {
							title: "未命名笔记",
							content: "",
							tags: [],
							pinned: false,
							notebookId: noteNotebookFilter !== "all" ? noteNotebookFilter : defaultNotebook()?.id
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					if (!data.note) throw new Error("创建失败");
					notes.unshift(data.note);
					noteSelected = data.note.id;
					ui.notesQ = "";
					ui.notesFilter = "all";
					ui.noteMode = "edit";
					noteDirty = false;
					noteSaveState = "saved";
					renderContent();
					window.setTimeout(() => {
						const input = $id("wb-note-title");
						input?.focus();
						input?.select();
					}, 0);
					toast("已创建笔记");
				} catch (cause) {
					toast(`创建失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteSelectedNote() {
				const note = noteById(noteSelected);
				if (!note) return;
				if (!(typeof window.confirm === "function" ? window.confirm(`删除笔记「${note.title || "未命名笔记"}」？`) : true)) return;
				try {
					const res = await fetch(`${API}/notes/${encodeURIComponent(note.id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					notes = notes.filter((n) => n.id !== note.id);
					noteDirty = false;
					noteSelected = sortedNotes()[0]?.id ?? notes[0]?.id ?? null;
					noteSaveState = "saved";
					renderContent();
					toast("笔记已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			async function toggleSelectedPin() {
				const note = noteById(noteSelected);
				if (!note) return;
				note.pinned = !note.pinned;
				noteDirty = true;
				noteChangeSeq += 1;
				await saveSelectedNote();
				renderContent();
			}
			function openNotebookCreate() {
				openModal(`<h3>新建笔记本</h3>
      <div class="mfield"><label>笔记本名称</label><input id="wb-nb-name" placeholder="例如：工作 / 学习 / 灵感" maxlength="80"></div>
      <div class="mfield"><label>关联工作区（可选）</label><input id="wb-nb-workspace" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">关联后，笔记会同步保存为工作区下的「.dsh-workbench/notes/」Markdown 文件。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="nb-create">创建</button></div>`);
				window.setTimeout(() => $id("wb-nb-name")?.focus(), 0);
			}
			function openNotebookManager() {
				openModal(`<h3>笔记本</h3>
      <div class="mfield"><label>新建笔记本</label><div class="nb-create-row"><input id="wb-nb-name" placeholder="例如：工作 / 学习 / 灵感" maxlength="80"><button class="btn solid" data-act="nb-create">创建</button></div><input id="wb-nb-workspace" placeholder="关联工作区路径（可选，例如 /Users/you/project）" style="margin-top:5px"></div>
      <div class="nb-list">${notebooks.map((nb) => `<div class="nb-row"><span class="nb-name">${esc(nb.name)}<span class="nb-ws">${esc(nb.workspacePath || "未关联工作区")}</span></span><span class="nb-count">${notes.filter((n) => n.notebookId === nb.id).length} 篇</span>
      <button class="btn" data-act="nb-rename" data-id="${nb.id}">重命名</button><button class="icon-btn" data-act="nb-delete" data-id="${nb.id}" title="删除">${ic("trash", 13)}</button></div>`).join("") || "<div class=\"notes-empty small\">还没有笔记本</div>"}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">完成</button></div>`);
			}
			function openNotebookRename(id) {
				const nb = notebookOf(id);
				if (!nb) return;
				openModal(`<h3>重命名笔记本</h3>
      <div class="mfield"><label>笔记本名称</label><input id="wb-nb-rename" value="${esc(nb.name)}" maxlength="80"></div>
      <div class="mfield"><label>关联工作区</label><input id="wb-nb-rename-workspace" value="${esc(nb.workspacePath ?? "")}" placeholder="/Users/you/project"></div>
      <div class="modal-foot"><button class="btn" data-act="notebook-manage">返回</button><button class="btn solid" data-act="nb-rename-save" data-id="${id}">保存</button></div>`);
				window.setTimeout(() => {
					const input = $id("wb-nb-rename");
					input?.focus();
					input?.select();
				}, 0);
			}
			async function createNotebook() {
				const input = $id("wb-nb-name");
				const name = input?.value.trim() ?? "";
				if (name === "") {
					input?.focus();
					return;
				}
				try {
					const res = await fetch(`${API}/notebooks`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ notebook: {
							name,
							workspacePath: $id("wb-nb-workspace")?.value.trim() ?? ""
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.notebook) throw new Error(data.message ?? `HTTP ${res.status}`);
					closeModal();
					noteNotebookFilter = data.notebook.id;
					await loadNotes();
					noteSelected = sortedNotes()[0]?.id ?? null;
					renderContent();
					toast(`已创建笔记本「${data.notebook.name}」`);
				} catch (cause) {
					toast(`创建失败：${String(cause.message ?? cause)}`);
				}
			}
			async function renameNotebook(id) {
				const input = $id("wb-nb-rename");
				const name = input?.value.trim() ?? "";
				if (name === "") {
					input?.focus();
					return;
				}
				try {
					const res = await fetch(`${API}/notebooks`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ notebook: {
							id,
							name,
							workspacePath: $id("wb-nb-rename-workspace")?.value.trim() ?? ""
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.notebook) throw new Error(data.message ?? `HTTP ${res.status}`);
					closeModal();
					await loadNotes();
					renderContent();
					toast("笔记本已重命名");
				} catch (cause) {
					toast(`重命名失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteNotebook(id) {
				if (notebooks.length <= 1) {
					toast("至少保留一个笔记本");
					return;
				}
				const nb = notebookOf(id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除笔记本「${nb?.name ?? ""}」？其中的笔记会移到其他笔记本。`) : true)) return;
				try {
					const res = await fetch(`${API}/notebooks/${encodeURIComponent(id)}`, { method: "DELETE" });
					const data = await res.json();
					if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
					if (noteNotebookFilter === id) noteNotebookFilter = "all";
					closeModal();
					await loadNotes();
					renderContent();
					toast(`笔记本已删除${data.moved ? `，${data.moved} 篇笔记已移动` : ""}`);
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function showExportResult(result) {
				lastExportPath = result.path ?? "";
				openModal(`<h3>${result.format === "pdf" ? "已导出 PDF" : "已另存为 Markdown"}</h3>
      <div class="export-result"><div class="export-name">${ic(result.format === "pdf" ? "pdf" : "note", 18)}${esc(result.filename ?? "")}</div>
      <div class="export-path">${esc(result.path ?? "")}</div></div>
      <div class="modal-foot"><button class="btn" data-act="open-export-folder">${ic("folder", 13)}打开文件夹</button><button class="btn" data-act="copy-export-path">复制路径</button><button class="btn solid" data-act="close-modal">完成</button></div>`);
			}
			async function openExportFolder() {
				if (lastExportPath === "") return;
				try {
					const res = await fetch(`${API}/notes/reveal`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ path: lastExportPath })
					});
					const data = await res.json();
					if (!res.ok || !data.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
					toast("已打开所在文件夹");
				} catch (cause) {
					toast(`打开失败：${String(cause.message ?? cause)}`);
				}
			}
			async function copyExportPath() {
				if (lastExportPath === "") return;
				try {
					await navigator.clipboard.writeText(lastExportPath);
					toast("已复制文件路径");
				} catch {
					toast(lastExportPath);
				}
			}
			async function exportSelectedNote(format) {
				if (noteExporting) return;
				const note = noteById(noteSelected);
				if (!note) return;
				await flushNoteSave();
				if (noteSaveState === "error") {
					toast("笔记还没保存成功，先不导出");
					return;
				}
				noteExporting = true;
				toast(format === "pdf" ? "正在生成 PDF…" : "正在另存…");
				try {
					const res = await fetch(`${API}/notes/export`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							noteId: note.id,
							format,
							html: markdownToHtml(note.content)
						})
					});
					const data = await res.json();
					if (!res.ok || !data.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
					showExportResult(data);
				} catch (cause) {
					toast(`导出失败：${String(cause.message ?? cause)}`);
				} finally {
					noteExporting = false;
				}
			}
			async function loadExportConfig() {
				try {
					const data = await (await fetch(`${API}/notes/config`)).json();
					exportDir = data.exportDir ?? "";
					defaultExportDir = data.defaultExportDir ?? "";
					const input = $id("wb-export-dir");
					if (input !== null) input.value = exportDir;
					const hint = $id("wb-export-hint");
					if (hint !== null) hint.textContent = `默认：${defaultExportDir}；另存与 PDF 都写入这里`;
				} catch (cause) {
					const hint = $id("wb-export-hint");
					if (hint !== null) hint.textContent = `读取失败：${String(cause.message ?? cause)}`;
				}
			}
			async function saveExportDir(dir) {
				try {
					const res = await fetch(`${API}/notes/config`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ exportDir: dir })
					});
					const data = await res.json();
					if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
					exportDir = data.exportDir ?? "";
					defaultExportDir = data.defaultExportDir ?? "";
					const input = $id("wb-export-dir");
					if (input !== null) input.value = exportDir;
					toast(`保存目录：${exportDir}`);
				} catch (cause) {
					toast(`目录保存失败：${String(cause.message ?? cause)}`);
				}
			}
			async function convertNoteToTask() {
				const note = noteById(noteSelected);
				if (!note) return;
				await flushNoteSave();
				const desc = noteText(note.content).slice(0, 200);
				createTask({
					title: note.title || "未命名笔记",
					desc
				});
				ui.view = "list";
				ui.scope = "today";
				renderAll();
				toast("已把笔记转为任务");
			}
			function renderNotes() {
				const selected = noteById(noteSelected);
				const tags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();
				const header = `<div class="view-head"><div><div class="eyebrow">记事本</div><h1 class="page-title">笔记</h1>
      <div class="page-sub">随手记下想法，自动保存到本机；支持 Markdown、标签与收藏</div></div>
      <button class="btn-primary" data-act="note-new">${ic("plus", 14)}新建笔记</button></div>`;
				if (noteError !== "") return header + `<div class="news-banner">${ic("flag", 13)}<span>笔记读取失败：${esc(noteError)}</span><button class="btn" data-act="note-retry">重试</button></div>`;
				const filters = `<div class="notes-filters">
      <button class="chip ${ui.notesFilter === "all" ? "active" : ""}" data-act="note-filter" data-filter="all">全部</button>
      <button class="chip ${ui.notesFilter === "pinned" ? "active" : ""}" data-act="note-filter" data-filter="pinned">${ic("pin", 11)}收藏</button>
      ${tags.slice(0, 8).map((tag) => `<button class="chip ${ui.notesFilter === "tag:" + tag ? "active" : ""}" data-act="note-filter" data-filter="tag:${esc(tag)}">#${esc(tag)}</button>`).join("")}
    </div>`;
				const side = `<aside class="notes-side">
      <div class="notes-nb-row">
        <select id="wb-notebook-filter" class="notes-nb-select" title="按笔记本筛选">
          <option value="all" ${noteNotebookFilter === "all" ? "selected" : ""}>全部笔记本（${notes.length}）</option>
          ${notebooks.map((nb) => `<option value="${nb.id}" ${noteNotebookFilter === nb.id ? "selected" : ""}>${esc(nb.name)}（${notes.filter((n) => n.notebookId === nb.id).length}）</option>`).join("")}
        </select>
        <button class="icon-btn" data-act="notebook-new" title="新建笔记本">${ic("plus", 14)}</button>
        <button class="icon-btn" data-act="notebook-manage" title="管理笔记本">${ic("settings", 14)}</button>
      </div>
      <div class="notes-search">${ic("search", 13)}<input id="wb-note-search" placeholder="搜索标题、正文或标签" value="${esc(ui.notesQ)}"></div>
      ${filters}
      <div class="notes-list" id="wb-note-list">${noteListHtml()}</div>
      <div class="notes-side-foot">${notes.length} 篇笔记 · ${notes.filter((n) => n.pinned).length} 篇收藏</div>
    </aside>`;
				let editor = "";
				if (selected === void 0) editor = `<section class="notes-editor empty"><div class="notes-empty"><div class="ne-icon">${ic("notebook", 22)}</div><b>还没有笔记</b><span>新建一篇，随手记下想法；停止输入后自动保存。</span><button class="btn-primary" data-act="note-new">${ic("plus", 14)}新建第一篇笔记</button></div></section>`;
				else {
					const editing = ui.noteMode === "edit";
					editor = `<section class="notes-editor">
        <div class="note-head">
          <input class="note-title-input" id="wb-note-title" value="${esc(selected.title)}" placeholder="笔记标题">
          <div class="note-actions">
            <button class="icon-btn ${selected.pinned ? "on" : ""}" data-act="note-pin" title="${selected.pinned ? "取消收藏" : "收藏"}">${ic("pin", 15)}</button>
            <button class="btn" data-act="note-ai-dispatch">${ic("spark", 12)}AI 协同</button>
            <button class="btn" data-act="note-saveas" title="导出 Markdown 到保存目录">${ic("download", 12)}导出 MD</button>
            <button class="btn" data-act="note-pdf" title="导出 PDF 到保存目录">${ic("pdf", 12)}导出 PDF</button>
            <button class="btn" data-act="note-convert">${ic("checkSquare", 13)}转为任务</button>
            <button class="icon-btn" data-act="note-delete" title="删除">${ic("trash", 14)}</button>
          </div>
        </div>
        <div class="note-meta-row">
          <select class="note-notebook-select" id="wb-note-notebook" title="所属笔记本">${notebooks.map((nb) => `<option value="${nb.id}" ${selected.notebookId === nb.id ? "selected" : ""}>${esc(nb.name)}</option>`).join("")}</select>
          <input class="note-tags-input" id="wb-note-tags" value="${esc(selected.tags.join(", "))}" placeholder="标签，用逗号分隔">
        </div>
        <div class="note-toolbar">
          <div class="mini-seg"><button data-act="note-tab" data-mode="edit" class="${editing ? "active" : ""}">编辑</button><button data-act="note-tab" data-mode="preview" class="${editing ? "" : "active"}">预览</button></div>
          <span class="note-save-state${noteSaveState === "saving" ? " busy" : noteSaveState === "error" ? " err" : ""}" id="wb-note-save">${noteSaveText()}</span>
          <span class="note-words" id="wb-note-words">${noteWords(selected.content)} 字</span>
          <button class="btn" data-act="note-ai-improve" title="AI 直接完善这篇笔记">${ic("spark", 12)}AI 完善</button>
          <button class="btn" data-act="note-ai-requirements" title="输入要求后让 AI 完善">按要求完善</button>
          <button class="btn" data-act="note-save">${ic("check", 12)}保存</button>
        </div>
        ${editing ? `<textarea class="note-textarea" id="wb-note-content" placeholder="支持 Markdown：标题、列表、引用、代码块、链接…">${esc(selected.content)}</textarea>` : `<div class="notes-preview" id="wb-note-preview">${markdownToHtml(selected.content)}</div>`}
        <div class="note-foot"><span id="wb-note-updated">更新于 ${ago(selected.updatedAt)}</span><span>停止输入后自动保存 · ⌘S 立即保存</span></div>
      </section>`;
				}
				return header + `<div class="notes-wrap">${side}${editor}</div>`;
			}
			function noteImprovePrompt(note, requirement) {
				const notebook = notebooks.find((nb) => nb.id === note.notebookId);
				const extra = requirement.trim() === "" ? "无额外要求；按通用编辑标准：结构清晰、信息完整、语言准确。" : requirement.trim();
				return `笔记完善任务

你是工作台的资深编辑与产品文档编辑。请完善下面这篇笔记，只修改这一篇，不要改其他笔记或工作区文件。

【笔记信息】
- noteId：${note.id}
- 标题：${note.title}
- 笔记本：${notebook?.name ?? "未分类"}
- 工作区：${notebook?.workspacePath || "未关联"}

【用户额外要求】
${extra}

【编辑原则】
1. 保留作者原意、事实和数据，不编造；不确定的内容标注而不是虚构。
2. 改善结构、层次、清晰度与完整度；补齐缺失的流程、边界、验收或行动项，但不要空泛扩写。
3. 保留 Markdown；标题核心含义不变，可微调措辞。
4. 不要只回复正文，不要用 write/edit 写文件；唯一交付方式：调用工具 workbench_note_update，参数 { noteId:"${note.id}", title:"可选新标题", content:"完整改进后的 Markdown" }。
5. 完成后用一句话说明改了什么。
6. 若内容已无实质改进空间，仍必须调用工具回写原文，并在总结中说明"无需修改"。
7. 重写幅度控制在原文 150% 字数内；保留作者语气与第一人称；总结里列出改了哪几处。

【当前正文】${note.content.length > 2e4 ? "（正文过长已截断至 2 万字，回写时请保留你未见到的尾部）" : ""}
${note.content.slice(0, 2e4)}`;
			}
			async function queueNoteImprove(prompt) {
				const note = noteById(noteSelected);
				await dispatchToNewSession((note ? notebookOf(note.notebookId) : void 0)?.workspacePath ?? "", prompt);
			}
			async function improveSelectedNote(requirement) {
				const note = noteById(noteSelected);
				if (!note) return;
				await flushNoteSave();
				if (noteSaveState === "error") {
					toast("当前笔记还没保存成功，先不提交 AI");
					return;
				}
				const prompt = noteImprovePrompt(note, requirement);
				try {
					await navigator.clipboard.writeText(prompt);
				} catch {}
				toast("正在新建 AI 编辑会话…");
				try {
					await queueNoteImprove(prompt);
				} catch (cause) {
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			function openNoteRequirements() {
				const note = noteById(noteSelected);
				if (!note) return;
				openModal(`<h3>按要求完善笔记</h3>
      <div class="mfield"><label>对这篇笔记的要求</label><textarea id="wb-note-req" rows="4" placeholder="例如：补充异常流程与验收标准；压缩到 800 字；改成更正式的产品文档语气"></textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 会在新会话中完善「${esc(note.title)}」，并通过 workbench_note_update 写回原笔记；保留笔记本、标签与收藏。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="note-ai-run">开始完善</button></div>`);
			}
			function bindNotes() {
				const notebookFilter = $id("wb-notebook-filter");
				notebookFilter?.addEventListener("change", () => {
					noteNotebookFilter = notebookFilter.value;
					noteSelected = sortedNotes()[0]?.id ?? null;
					renderContent();
				});
				const noteNotebook = $id("wb-note-notebook");
				noteNotebook?.addEventListener("change", () => {
					const note = noteById(noteSelected);
					if (note) {
						note.notebookId = noteNotebook.value;
						noteNotebookFilter = noteNotebook.value;
						scheduleNoteSave();
						renderContent();
					}
				});
				const search = $id("wb-note-search");
				search?.addEventListener("input", () => {
					ui.notesQ = search.value;
					renderNoteListOnly();
				});
				const title = $id("wb-note-title");
				title?.addEventListener("input", () => {
					const note = noteById(noteSelected);
					if (note) {
						note.title = title.value;
						scheduleNoteSave();
					}
				});
				const tags = $id("wb-note-tags");
				tags?.addEventListener("input", () => {
					const note = noteById(noteSelected);
					if (note) {
						note.tags = tags.value.split(/[,，]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
						scheduleNoteSave();
					}
				});
				const content = $id("wb-note-content");
				content?.addEventListener("input", () => {
					const note = noteById(noteSelected);
					if (note) {
						note.content = content.value;
						updateNoteWords();
						scheduleNoteSave();
					}
				});
			}
			const BUG_STATUSES = [
				"open",
				"doing",
				"verify",
				"resolved"
			];
			const BUG_STATUS_LABEL = {
				open: "待处理",
				doing: "进行中",
				verify: "待验证",
				resolved: "已解决"
			};
			const BUG_STATUS_DOT = {
				open: "var(--text-3)",
				doing: "var(--blue)",
				verify: "var(--amber)",
				resolved: "var(--green)"
			};
			const BUG_SEVERITY_LABEL = {
				blocker: "致命",
				major: "严重",
				minor: "一般",
				trivial: "轻微"
			};
			const BUG_SEVERITY_COLOR = {
				blocker: "var(--red)",
				major: "var(--orange)",
				minor: "var(--amber)",
				trivial: "var(--text-3)"
			};
			const BUG_PRIORITY_LABEL = {
				P0: "P0",
				P1: "P1",
				P2: "P2",
				P3: "P3"
			};
			const BUG_PRIORITY_ORDER = {
				P0: 0,
				P1: 1,
				P2: 2,
				P3: 3
			};
			function bugOf(id) {
				return bugs.find((b) => b.id === id);
			}
			function bugProjectOf(id) {
				return bugProjects.find((p) => p.id === id);
			}
			function bugWorkspaceName(path) {
				return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
			}
			function bugWorkspaceItems() {
				try {
					const snap = (dshCtx?.get?.("workspaces"))?.list?.getSnapshot?.();
					if (snap?.phase === "ready" && Array.isArray(snap.items)) return snap.items.filter((x) => typeof x?.path === "string");
				} catch {}
				return [];
			}
			/**
			* 在本项目关联工作区新建一个普通 DSH 会话，并写入修复提示词后发送。
			* 走 sessions 服务（workspaceId / cwd）新建 → 发送 → 回写 → 切到会话，不刷新页面。
			*/
			async function queueRepairSession(project, prompt, bugIds, options = {}) {
				return await dispatchToNewSession(project.workspacePath, prompt, async (sessionId) => {
					await markBugsDispatched(bugIds, sessionId);
				}, options);
			}
			function bugFiltered() {
				const q = bugSearch.trim().toLowerCase();
				return bugs.filter((bug) => {
					if (bugProjectFilter !== "all" && bug.projectId !== bugProjectFilter) return false;
					if (q === "") return true;
					return `${bug.code} ${bug.title} ${bug.description} ${bug.tags.join(" ")}`.toLowerCase().includes(q);
				});
			}
			function bugStats(list) {
				const stat = {
					total: list.length,
					open: 0,
					doing: 0,
					verify: 0,
					resolved: 0,
					blocker: 0,
					major: 0,
					minor: 0,
					trivial: 0,
					planned: 0,
					rate: 0
				};
				for (const bug of list) {
					stat[bug.status] += 1;
					stat[bug.severity] += 1;
					if (bug.plannedDate !== "" && bug.plannedDate <= todayKey() && bug.status !== "resolved") stat.planned += 1;
				}
				stat.rate = stat.total === 0 ? 0 : Math.round(stat.resolved / stat.total * 100);
				return stat;
			}
			function renderBugCard(bug) {
				const project = bugProjectOf(bug.projectId);
				const selected = bugSelected.has(bug.id);
				const overdue = bug.plannedDate !== "" && bug.plannedDate < todayKey() && bug.status !== "resolved";
				return `<article class="bug-card${selected ? " selected" : ""}" data-bug-id="${bug.id}" data-status="${bug.status}">
      <div class="bug-card-top">
        <button class="bug-check${selected ? " on" : ""}" data-act="bug-select" data-id="${bug.id}" title="选择">${selected ? ic("check", 11) : ""}</button>
        <span class="bug-code">${esc(bug.code || bug.id.slice(-4).toUpperCase())}</span>
        <span class="bug-priority ${bug.priority}">${BUG_PRIORITY_LABEL[bug.priority] ?? "P2"}</span>
        <span class="bug-sev" style="color:${BUG_SEVERITY_COLOR[bug.severity]}">${BUG_SEVERITY_LABEL[bug.severity] ?? "一般"}</span>
        <span class="platform ${bug.platform || "all"}">${platformLabel(bug.platform || "all")}</span>
        ${bug.aiThreadId !== "" ? `<span class="bug-ai" title="已提交工作区修复会话">${ic("spark", 10)}AI</span>` : ""}
      </div>
      <div class="bug-title">${esc(bug.title)}</div>
      ${bug.description !== "" ? `<div class="bug-desc">${esc(bug.description.slice(0, 130))}</div>` : ""}
      ${bug.tags.length > 0 ? `<div class="bug-tags">${bug.tags.slice(0, 3).map((tag) => `<span>#${esc(tag)}</span>`).join("")}</div>` : ""}
      <div class="bug-card-foot">
        <span class="bug-avatar" title="${esc(bug.assignee)}">${esc((bug.assignee || "我").slice(0, 1))}</span>
        <span class="bug-project-name">${esc(project?.name ?? "未分类")}</span>
        ${bug.plannedDate !== "" ? `<span class="bug-due${overdue ? " overdue" : ""}">${ic("calendar", 10)}${esc(bug.plannedDate.slice(5))}</span>` : ""}
      </div>
    </article>`;
			}
			function bugMainHtml() {
				const list = bugFiltered();
				const stat = bugStats(list);
				if (bugProjects.length === 0) return `<div class="notes-empty bug-empty"><div class="ne-icon">${ic("bug", 22)}</div><b>还没有 Bug 项目</b><span>先创建一个项目并关联 DSH 工作区，再录入 Bug。</span><button class="btn-primary" data-act="bug-project-new">${ic("plus", 14)}新建项目</button></div>`;
				const stats = `<div class="bug-stats">
      <div class="bug-stat"><b>${stat.total}</b><span>全部</span></div>
      <div class="bug-stat"><b style="color:var(--text-2)">${stat.open}</b><span>待处理</span></div>
      <div class="bug-stat"><b style="color:var(--blue)">${stat.doing}</b><span>进行中</span></div>
      <div class="bug-stat"><b style="color:var(--amber)">${stat.verify}</b><span>待验证</span></div>
      <div class="bug-stat"><b style="color:var(--green)">${stat.resolved}</b><span>已解决</span></div>
      <div class="bug-stat"><b>${stat.planned}</b><span>今日计划</span></div>
      <div class="bug-progress-wrap"><div class="bug-progress-label"><span>完成率</span><b>${stat.rate}%</b></div><div class="bug-progress"><i style="width:${stat.rate}%"></i></div></div>
      <div class="bug-sev-stats">
        ${[
					"blocker",
					"major",
					"minor",
					"trivial"
				].map((sev) => `<span style="color:${BUG_SEVERITY_COLOR[sev]}">${BUG_SEVERITY_LABEL[sev]} ${stat[sev]}</span>`).join("")}
      </div>
    </div>`;
				const batch = bugSelected.size > 0 ? `<div class="bug-batch"><b>已选 ${bugSelected.size} 条</b><button class="btn solid" data-act="bug-submit-selected">${ic("spark", 12)}提交到工作区会话</button><button class="btn" data-act="bug-plan-selected">${ic("calendar", 12)}设置计划</button><button class="btn" data-act="bug-select-clear">清除选择</button></div>` : "";
				const columns = BUG_STATUSES.map((status) => {
					const items = list.filter((b) => b.status === status).sort((a, b) => BUG_PRIORITY_ORDER[a.priority] - BUG_PRIORITY_ORDER[b.priority] || b.updatedAt.localeCompare(a.updatedAt));
					return `<section class="bug-col" data-status="${status}">
        <header><span class="bug-col-dot" style="background:${BUG_STATUS_DOT[status]}"></span><b>${BUG_STATUS_LABEL[status]}</b><span class="bug-col-count">${items.length}</span><button class="icon-btn" data-act="bug-new" data-status="${status}" title="新建 Bug">${ic("plus", 13)}</button></header>
        <div class="bug-col-body">${items.length === 0 ? `<div class="bug-col-empty">暂无 Bug</div>` : items.map(renderBugCard).join("")}</div>
      </section>`;
				}).join("");
				return stats + batch + `<div class="bug-board">${columns}</div>`;
			}
			function refreshBugMain() {
				const main = $id("wb-bug-main");
				if (main !== null) {
					main.innerHTML = bugMainHtml();
					bindBugSearchOnly();
				}
			}
			function renderBugs() {
				const project = bugProjectFilter === "all" ? void 0 : bugProjectOf(bugProjectFilter);
				const header = `<div class="view-head"><div><div class="eyebrow">质量管理</div><h1 class="page-title">Bug 管理</h1>
      <div class="page-sub">${project ? `${esc(project.name)} · 工作区 ${esc(project.workspacePath || "未关联")}` : "多项目卡片看板；可多选 / 单选 / 按计划提交到工作区会话 修复"}</div><div class="head-pills"><span><b>${bugs.length}</b> Bug</span><span><b>${bugProjects.length}</b> 项目</span><span><b>${bugs.filter((b) => b.status !== "resolved").length}</b> 未关闭</span></div></div>
      <div class="bug-head-actions"><button class="btn" data-act="ai-dispatch" data-kind="bug">${ic("spark", 13)}AI 协同</button><button class="btn" data-act="bug-project-new">${ic("folder", 13)}新建项目</button><button class="btn" data-act="bug-plan-submit">${ic("calendar", 13)}按计划提交</button><button class="btn-primary" data-act="bug-new">${ic("plus", 14)}新建 Bug</button></div></div>`;
				if (bugError !== "") return header + `<div class="news-banner">${ic("flag", 13)}<span>Bug 读取失败：${esc(bugError)}</span><button class="btn" data-act="bug-refresh">重试</button></div>`;
				return header + `<div class="bug-toolbar">
      <select id="wb-bug-project" class="bug-project-select"><option value="all" ${bugProjectFilter === "all" ? "selected" : ""}>全部项目（${bugs.length}）</option>${bugProjects.map((p) => `<option value="${p.id}" ${bugProjectFilter === p.id ? "selected" : ""}>${esc(p.name)}（${bugs.filter((b) => b.projectId === p.id).length}）</option>`).join("")}</select>
      <button class="icon-btn" data-act="bug-project-manage" title="管理项目">${ic("settings", 14)}</button>
      <div class="bug-search">${ic("search", 13)}<input id="wb-bug-search" value="${esc(bugSearch)}" placeholder="搜索 Bug 标题、描述或标签"></div>
      <button class="icon-btn" data-act="bug-refresh" title="刷新">${ic("refresh", 14)}</button>
    </div><div id="wb-bug-main">${bugMainHtml()}</div>`;
			}
			function bindBugSearchOnly() {
				const input = $id("wb-bug-search");
				if (input !== null && input.dataset.bound !== "1") {
					input.dataset.bound = "1";
					input.addEventListener("input", () => {
						bugSearch = input.value;
						refreshBugMain();
					});
				}
			}
			function bindBugs() {
				bindBugSearchOnly();
				const select = $id("wb-bug-project");
				select?.addEventListener("change", () => {
					bugProjectFilter = select.value;
					bugSelected.clear();
					renderContent();
				});
			}
			async function loadBugs(silent = false) {
				if (bugLoading) return;
				bugLoading = true;
				if (!silent) {
					bugError = "";
					if (ui.view === "bugs") renderContent();
				}
				try {
					const [res, mRes] = await Promise.all([fetch(`${API}/bugs`), fetch(`${API}/modules`)]);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					bugProjects = Array.isArray(data.projects) ? data.projects : [];
					bugs = Array.isArray(data.bugs) ? data.bugs : [];
					if (mRes.ok) {
						const m = await mRes.json();
						productModules = Array.isArray(m.modules) ? m.modules : [];
					}
					const valid = new Set(bugs.map((b) => b.id));
					bugSelected = new Set(Array.from(bugSelected).filter((id) => valid.has(id)));
					if (bugProjectFilter !== "all" && bugProjectOf(bugProjectFilter) === void 0) bugProjectFilter = "all";
					bugError = "";
				} catch (cause) {
					if (!silent) bugError = String(cause.message ?? cause);
				}
				bugLoading = false;
				if (ui.view !== "bugs") return;
				const sig = JSON.stringify({
					p: bugProjects.map((p) => [
						p.id,
						p.name,
						p.workspacePath,
						p.count
					]),
					b: bugs.map((b) => [
						b.id,
						b.status,
						b.severity,
						b.priority,
						b.plannedDate,
						b.title,
						b.verification,
						b.aiThreadId,
						b.updatedAt
					])
				});
				if (!silent || sig !== bugsSig) {
					bugsSig = sig;
					if (($id("wb-modal")?.innerHTML ?? "") === "") renderContent();
				}
			}
			function openBugProject(id) {
				const project = bugProjectOf(id);
				const workspaces = bugWorkspaceItems();
				const currentPath = project?.workspacePath ?? workspaces[0]?.path ?? "";
				const options = workspaces.map((ws) => `<option value="${esc(ws.path)}" ${ws.path === currentPath ? "selected" : ""}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join("");
				openModal(`<h3>${project ? "编辑项目" : "新建 Bug 项目"}</h3>
      <div class="mfield"><label>项目名称</label><input id="wb-bugp-name" value="${esc(project?.name ?? "")}" placeholder="例如：工作台 / 官网"></div>
      <div class="mfield"><label>关联 DSH 工作区</label>${workspaces.length > 0 ? `<select id="wb-bugp-ws">${options}</select>` : "<div class=\"muted\" style=\"font-size:10.5px;line-height:1.6\">未读取到 DSH 工作区列表；可直接填绝对路径。</div>"}</div>
      <div class="mfield"><label>工作区路径</label><input id="wb-bugp-path" value="${esc(currentPath)}" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">提交 Bug 时会在本项目工作区新建会话，写入工作区路径与修复要求；AI 在该目录中修复并验证。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-project-save" data-id="${project?.id ?? ""}">${project ? "保存" : "创建项目"}</button></div>`);
				$id("wb-bugp-ws")?.addEventListener("change", (event) => {
					const value = event.currentTarget.value;
					const input = $id("wb-bugp-path");
					if (input !== null) input.value = value;
				});
			}
			async function saveBugProject(id) {
				const name = $id("wb-bugp-name")?.value.trim() ?? "";
				const workspacePath = $id("wb-bugp-path")?.value.trim() ?? "";
				if (name === "") {
					$id("wb-bugp-name")?.focus();
					return;
				}
				try {
					const res = await fetch(`${API}/bugs/projects`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ project: {
							id: id || void 0,
							name,
							workspacePath,
							workspaceName: bugWorkspaceName(workspacePath)
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.project) throw new Error(data.message ?? `HTTP ${res.status}`);
					const index = bugProjects.findIndex((p) => p.id === data.project.id);
					if (index >= 0) bugProjects[index] = data.project;
					else bugProjects.push(data.project);
					closeModal();
					if (bugProjectFilter === "all") bugProjectFilter = data.project.id;
					await loadBugs(true);
					renderContent();
					toast("项目已保存");
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			function openBugProjectManager() {
				openModal(`<h3>Bug 项目</h3>
      <div class="nb-list">${bugProjects.map((project) => `<div class="nb-row"><span class="nb-name">${esc(project.name)}<span class="nb-ws">${esc(project.workspacePath || "未关联工作区")}</span></span><span class="nb-count">${bugs.filter((b) => b.projectId === project.id).length} 条</span>
      <button class="btn" data-act="bug-project-edit" data-id="${project.id}">编辑</button><button class="icon-btn" data-act="bug-project-delete" data-id="${project.id}" title="删除">${ic("trash", 13)}</button></div>`).join("") || "<div class=\"notes-empty small\">还没有项目</div>"}</div>
      <div class="modal-foot"><button class="btn" data-act="bug-project-new">${ic("plus", 12)}新建项目</button><button class="btn solid" data-act="close-modal">完成</button></div>`);
			}
			async function deleteBugProject(id) {
				const project = bugProjectOf(id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除项目「${project?.name ?? ""}」及其全部 Bug？`) : true)) return;
				try {
					const res = await fetch(`${API}/bugs/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					bugProjects = bugProjects.filter((p) => p.id !== id);
					bugs = bugs.filter((b) => b.projectId !== id);
					if (bugProjectFilter === id) bugProjectFilter = "all";
					closeModal();
					renderContent();
					toast("项目已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function openBugEditor(id, status) {
				if (bugProjects.length === 0) {
					openBugProject();
					return;
				}
				const bug = bugOf(id);
				const projectId = bug?.projectId ?? (bugProjectFilter === "all" ? bugProjects[0].id : bugProjectFilter);
				openModal(`<h3>${bug ? "编辑 Bug" : "新建 Bug"}</h3>
      <div class="mfield"><label>标题</label><input id="wb-bug-title" value="${esc(bug?.title ?? "")}" placeholder="例如：看板卡片在窄屏下重叠" maxlength="300"></div>
      <div class="mfield"><label>描述 / 复现步骤</label><textarea id="wb-bug-desc" rows="4" placeholder="现象、复现步骤、期望结果">${esc(bug?.description ?? "")}</textarea></div>
      <div class="mrow"><div class="mfield"><label>项目</label><select id="wb-bug-project-sel">${bugProjects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="mfield"><label>模块</label><select id="wb-bug-module"><option value="">无模块</option>${productModules.map((m) => `<option value="${m.id}" ${(bug?.moduleId ?? "") === m.id ? "selected" : ""}>${esc(m.name)} · ${m.platform.toUpperCase()}</option>`).join("")}</select></div>
      <div class="mfield"><label>端</label><select id="wb-bug-platform">${[
					"all",
					"pc",
					"mobile",
					"tablet"
				].map((p) => `<option value="${p}" ${(bug?.platform ?? "all") === p ? "selected" : ""}>${platformLabel(p)}</option>`).join("")}</select></div>
      <div class="mfield"><label>状态</label><select id="wb-bug-status">${BUG_STATUSES.map((s) => `<option value="${s}" ${(bug?.status ?? status ?? "open") === s ? "selected" : ""}>${BUG_STATUS_LABEL[s]}</option>`).join("")}</select></div></div>
      <div class="mrow"><div class="mfield"><label>严重程度</label><select id="wb-bug-sev">${[
					"blocker",
					"major",
					"minor",
					"trivial"
				].map((s) => `<option value="${s}" ${(bug?.severity ?? "minor") === s ? "selected" : ""}>${BUG_SEVERITY_LABEL[s]}</option>`).join("")}</select></div>
      <div class="mfield"><label>优先级</label><select id="wb-bug-prio">${[
					"P0",
					"P1",
					"P2",
					"P3"
				].map((p) => `<option value="${p}" ${(bug?.priority ?? "P2") === p ? "selected" : ""}>${p}</option>`).join("")}</select></div></div>
      <div class="mrow"><div class="mfield"><label>计划日期</label><input id="wb-bug-plan" type="date" value="${esc(bug?.plannedDate ?? todayKey())}"></div>
      <div class="mfield"><label>指派给</label><input id="wb-bug-assignee" value="${esc(bug?.assignee ?? "我")}" maxlength="40"></div></div>
      <div class="mfield"><label>标签（逗号分隔）</label><input id="wb-bug-tags" value="${esc(bug?.tags.join(", ") ?? "")}" placeholder="UI, 回归"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-save" data-id="${bug?.id ?? ""}">${bug ? "保存" : "创建 Bug"}</button></div>`);
			}
			async function saveBug(id) {
				const title = $id("wb-bug-title")?.value.trim() ?? "";
				if (title === "") {
					$id("wb-bug-title")?.focus();
					return;
				}
				const payload = {
					id: id || void 0,
					projectId: $id("wb-bug-project-sel")?.value ?? "",
					title,
					description: $id("wb-bug-desc")?.value ?? "",
					status: $id("wb-bug-status")?.value ?? "open",
					severity: $id("wb-bug-sev")?.value ?? "minor",
					priority: $id("wb-bug-prio")?.value ?? "P2",
					platform: $id("wb-bug-platform")?.value ?? "all",
					moduleId: $id("wb-bug-module")?.value ?? "",
					plannedDate: $id("wb-bug-plan")?.value ?? "",
					assignee: $id("wb-bug-assignee")?.value.trim() || "我",
					tags: ($id("wb-bug-tags")?.value ?? "").split(/[,，]/).map((x) => x.trim()).filter(Boolean)
				};
				try {
					const res = await fetch(`${API}/bugs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ bug: payload })
					});
					const data = await res.json();
					if (!res.ok || !data.bug) throw new Error(data.message ?? `HTTP ${res.status}`);
					const index = bugs.findIndex((b) => b.id === data.bug.id);
					if (index >= 0) bugs[index] = data.bug;
					else bugs.unshift(data.bug);
					closeModal();
					renderContent();
					toast(id ? "Bug 已更新" : "Bug 已创建");
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			function openBugDetail(id) {
				const bug = bugOf(id);
				if (!bug) return;
				const project = bugProjectOf(bug.projectId);
				openModal(`<h3>${esc(bug.code || "BUG")} · ${esc(bug.title)}</h3>
      <div class="bug-detail-meta"><span>${esc(project?.name ?? "未分类")}</span><span>${esc(project?.workspacePath || "未关联工作区")}</span></div>
      <div class="bug-detail-status">${BUG_STATUSES.map((s) => `<button class="chip ${bug.status === s ? "active" : ""}" data-act="bug-status" data-id="${bug.id}" data-status="${s}">${BUG_STATUS_LABEL[s]}</button>`).join("")}</div>
      <div class="mfield"><label>描述</label><div class="bug-detail-text">${esc(bug.description || "无描述")}</div></div>
      <div class="mrow"><div class="mfield"><label>严重 / 优先级</label><div class="bug-detail-text">${BUG_SEVERITY_LABEL[bug.severity]} · ${bug.priority}</div></div><div class="mfield"><label>计划 / 指派</label><div class="bug-detail-text">${esc(bug.plannedDate || "未排期")} · ${esc(bug.assignee)}</div></div></div>
      ${bug.verification !== "" ? `<div class="mfield"><label>验证记录</label><div class="bug-detail-text">${esc(bug.verification)}</div></div>` : ""}
      ${bug.aiThreadId !== "" ? `<div class="mfield"><label>AI 修复会话</label><div class="bug-detail-text mono">${esc(bug.aiThreadId)}<button class="btn" data-act="bug-goto-session" data-id="${bug.aiThreadId}" style="margin-left:6px">跳转会话</button></div></div>` : ""}
      <div class="modal-foot bug-foot"><button class="btn" data-act="bug-delete" data-id="${bug.id}">${ic("trash", 12)}删除</button><button class="btn" data-act="bug-edit" data-id="${bug.id}">编辑</button>${bug.status === "verify" || bug.status === "resolved" ? `<button class="btn" data-act="bug-regression">${ic("refresh", 12)}去回归</button>` : ""}<button class="btn" data-act="bug-ai-dispatch" data-id="${bug.id}">${ic("spark", 12)}AI 协同</button><button class="btn solid" data-act="bug-ai-submit" data-id="${bug.id}">${ic("spark", 12)}提交 AI 修复</button></div>`);
			}
			async function deleteBug(id) {
				const bug = bugOf(id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除 ${bug?.code ?? ""}「${bug?.title ?? ""}」？`) : true)) return;
				try {
					const res = await fetch(`${API}/bugs/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					bugs = bugs.filter((b) => b.id !== id);
					bugSelected.delete(id);
					closeModal();
					renderContent();
					toast("Bug 已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			async function setBugStatus(id, status) {
				const bug = bugOf(id);
				if (!bug) return;
				try {
					const res = await fetch(`${API}/bugs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ bug: {
							...bug,
							status
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					if (data.bug) Object.assign(bug, data.bug);
					closeModal();
					renderContent();
					toast(`已移到「${BUG_STATUS_LABEL[status]}」`);
				} catch (cause) {
					toast(`更新失败：${String(cause.message ?? cause)}`);
				}
			}
			function planSelectedBugs() {
				if (bugSelected.size === 0) return;
				openModal(`<h3>设置计划</h3>
      <div class="mfield"><label>计划日期（${bugSelected.size} 条 Bug）</label><input id="wb-bug-plan-batch" type="date" value="${todayKey()}"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-plan-save">保存计划</button></div>`);
			}
			async function saveBugPlan() {
				const date = $id("wb-bug-plan-batch")?.value ?? "";
				const ids = Array.from(bugSelected);
				try {
					for (const id of ids) {
						const bug = bugOf(id);
						if (!bug) continue;
						const res = await fetch(`${API}/bugs`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ bug: {
								...bug,
								plannedDate: date
							} })
						});
						if (!res.ok) throw new Error(`HTTP ${res.status}`);
						const data = await res.json();
						if (data.bug) Object.assign(bug, data.bug);
					}
					closeModal();
					renderContent();
					toast(`已设置 ${ids.length} 条计划`);
				} catch (cause) {
					toast(`设置失败：${String(cause.message ?? cause)}`);
				}
			}
			function bugPrompt(list) {
				const project = bugProjectOf(list[0]?.projectId);
				const lines = list.map((bug, index) => {
					const proj = bugProjectOf(bug.projectId);
					const moduleName = productModules.find((m) => m.id === bug.moduleId)?.name ?? "";
					return `${index + 1}. [${bug.code}] ${bug.title}
   bugId: ${bug.id}
   项目: ${proj?.name ?? ""}
   工作区: ${proj?.workspacePath || "未关联"}
   模块: ${moduleName || "无"} · 端: ${platformLabel(bug.platform || "all")} · 指派: ${bug.assignee || "我"}
   严重程度: ${BUG_SEVERITY_LABEL[bug.severity]} · 优先级: ${bug.priority}
   计划: ${bug.plannedDate || "未排期"}
   现象/复现: ${bug.description || "未填写"}`;
				}).join("\n\n");
				return `Bug 修复任务：${project?.name ?? "Bug 项目"} · ${list.length} 条

你是 DSH 的资深修复工程师。你已在本项目关联工作区中新建会话，请直接开始修复，不要只做分析或只回复收到。

【任务上下文】
- 项目：${project?.name ?? "Bug 项目"}
- 工作区绝对路径：${project?.workspacePath || "未关联"}
- 当前会话可能继承其他 cwd；所有检查、修改、验证都必须以该工作区为根，必要时使用绝对路径。
- 涉及端/模块见每条 Bug 的「模块 / 端」字段；多端差异必须分别验证。
- 目标：逐条定位根因，做最小必要修改，在工作区中实际验证，然后回写 Bug 状态。
- 会话开始先执行 git status --porcelain；若有未提交改动，在汇报开头列出并说明与本次修改的边界。

【修复流程（每条 Bug 都执行）】
1. 读取相关代码、配置和测试，复现或确认现象；先不要盲改。
2. 写出根因判断，再做最小改动；保留现有 API/UI 行为，不要用掩盖症状的方式绕过问题。
3. 运行针对性验证（测试、构建、脚本或明确的手动复现步骤）；记录命令与结果。
4. 状态语义：验证通过→resolved；改完待人工确认→verify；无法复现/受阻→verify 且 verification 首行写【阻塞】+原因。
5. 立即调用工具 workbench_bug_update 回写，再进行下一条。首条回写可传 aiThreadId 标记本会话。

【硬性约束】
- 一次只处理一条 Bug，完成回写后再开始下一条，避免交叉污染。
- 同一 Bug 连续 3 次修复未通过验证 → 置 verify，verification 首行写【阻塞】+原因，不要继续消耗。
- 不修改与 Bug 无关的文件；不升级/新增依赖；不改 lockfile；不执行 git commit/push；不删除用户数据。
- 不伪造验证结果；没有实际运行验证就不要写"已验证"。
- 如果工作区路径不存在或无权限，立即把该 Bug 置为 verify 并说明原因，不要继续猜测。

【回写工具】
workbench_bug_update
参数：
{ "bugId": "上面每条给出的 bugId", "status": "doing" | "verify" | "resolved", "verification": "实际执行的命令/步骤与结果", "note": "可选补充", "aiThreadId": "可选，本会话 id" }

【Bug 列表】

${lines}

【最终汇报】
逐条用「编号 + 根因 + 改动文件 + 验证结果 + 新状态」简要汇报；最后列出未能解决的 Bug 和原因。`;
			}
			async function submitBugsToAI(ids, skipConfirm = false) {
				const list = ids.map((id) => bugOf(id)).filter((b) => b !== void 0);
				if (list.length === 0) {
					toast("请先选择 Bug");
					return;
				}
				const groups = /* @__PURE__ */ new Map();
				for (const bug of list) {
					const group = groups.get(bug.projectId) ?? [];
					group.push(bug);
					groups.set(bug.projectId, group);
				}
				const groupList = Array.from(groups.entries());
				if (groupList.length > 1 && !skipConfirm) {
					const summary = groupList.map(([pid, items]) => `「${bugProjectOf(pid)?.name ?? pid}」${items.length} 条`).join("、");
					if (!(typeof window.confirm === "function" ? window.confirm(`选中的 Bug 来自 ${groupList.length} 个项目（${summary}）。\n将按项目分组、每组各建一个工作区会话提交。继续？`) : true)) return;
				}
				let firstSession = "";
				let submitted = 0;
				for (const [projectId, items] of groupList) {
					const project = bugProjectOf(projectId);
					if (!project?.workspacePath) {
						toast(`项目「${project?.name ?? projectId}」还没关联工作区，跳过 ${items.length} 条`);
						continue;
					}
					const prompt = bugPrompt(items);
					try {
						await navigator.clipboard.writeText(prompt);
					} catch {}
					try {
						const sessionId = await queueRepairSession(project, prompt, items.map((b) => b.id), { focus: false });
						submitted += items.length;
						if (firstSession === "") firstSession = sessionId;
					} catch (cause) {
						toast(`「${project.name}」提交失败：${String(cause.message ?? cause)}`);
					}
				}
				if (submitted === 0) return;
				if (firstSession !== "") focusSession(firstSession);
				toast(groupList.length > 1 ? `已为 ${groupList.length} 个项目各建一个会话，共 ${submitted} 条` : `已提交 ${submitted} 条 Bug`);
			}
			async function submitPlannedBugs() {
				const list = bugFiltered().filter((bug) => bug.plannedDate !== "" && bug.plannedDate <= todayKey() && bug.status !== "resolved");
				if (list.length === 0) {
					toast("今天没有待提交的计划 Bug");
					return;
				}
				if (!(typeof window.confirm === "function" ? window.confirm(`提交今天计划的 ${list.length} 条 Bug？将在工作区新建会话修复。`) : true)) return;
				await submitBugsToAI(list.map((b) => b.id), true);
			}
			const PRODUCT_STYLES = [
				{
					id: "clean",
					name: "极简白",
					hint: "白底 / 蓝色主色 / 轻阴影 · 通用",
					platform: "all"
				},
				{
					id: "glass",
					name: "玻璃拟态 ★",
					hint: "深色渐变 / 半透明卡片 / 模糊 · 2024-26 主流",
					platform: "all",
					popular: true
				},
				{
					id: "neo",
					name: "新拟态",
					hint: "灰底 / 双层阴影 / 柔和圆角 · 通用",
					platform: "all"
				},
				{
					id: "editorial",
					name: "编辑杂志",
					hint: "米白 / 衬线标题 / 强网格 · PC 内容型",
					platform: "pc"
				},
				{
					id: "dashboard",
					name: "暗色仪表盘 ★",
					hint: "深色 / 数据卡片 / 霓虹强调 · PC 后台标配",
					platform: "pc",
					popular: true
				},
				{
					id: "bento",
					name: "Bento 网格 ★",
					hint: "拼色卡片 / 大圆角 / 非对称栅格 · 当下流行",
					platform: "pc",
					popular: true
				},
				{
					id: "tech",
					name: "科技终端",
					hint: "深蓝黑 / 等宽字 / 网格线 · 工具型产品",
					platform: "pc"
				},
				{
					id: "aurora",
					name: "流光渐变 ★",
					hint: "极光紫蓝 / 大渐变 / 毛玻璃 · 移动端流行",
					platform: "mobile",
					popular: true
				},
				{
					id: "cream",
					name: "温暖奶油 ★",
					hint: "奶油色 / 大字重 / 软阴影 · 移动端流行",
					platform: "mobile",
					popular: true
				},
				{
					id: "clay",
					name: "黏土拟态",
					hint: "3D 软塑 / 饱和色 / 厚圆角 · 移动端",
					platform: "mobile"
				},
				{
					id: "brutal",
					name: "新粗野",
					hint: "高对比 / 硬边框 / 鲜艳色块 · 移动端潮牌风",
					platform: "mobile"
				},
				{
					id: "padflow",
					name: "平板双栏",
					hint: "侧栏 + 内容 / 大触控目标 · 平板优先",
					platform: "tablet"
				}
			];
			const themeOf = (id) => PRODUCT_STYLES.find((t) => t.id === id) ?? PRODUCT_STYLES[0];
			/** 主题设计令牌：写进提示词，约束 AI 产出与本地渲染一致的视觉 */
			function themeTokens(id) {
				const tokens = {
					clean: "bg:#f7f9fc surface:#fff text:#111827 muted:#5b6577 line:#e4e9f2 accent:#2563eb radius:10px shadow:轻",
					neo: "bg:#e8ebf0 surface:#eef1f6 text:#2b3340 accent:#4f6bed 双层柔和阴影（外深内亮） radius:16px 无硬边框",
					glass: "bg:#0c1222 深色渐变 surface:rgba(255,255,255,.06) backdrop-blur:14px text:#eef4ff accent:#7aa2ff 半透明卡片细边框",
					editorial: "bg:#f6f1e7 surface:#fbf7ef 衬线标题（Georgia/宋体）强网格 text:#1f1b16 accent:#c2410c",
					dashboard: "bg:#0f172a surface:#1e293b card:#16233a text:#e2e8f0 accent:#38bdf8 辅助:紫#a78bfa/绿#34d399 细边框 radius:12px 数据可视化感",
					bento: "多色卡片块（#fff/#fde68a/#bfdbfe/#bbf7d0 交错）大圆角 20px 非对称栅格 text:#111827 强留白 大标题",
					tech: "bg:#0a0f1a surface:#111827 text:#d1fae5 accent:#22d3ee 等宽字体点缀 网格线背景 细线描边 radius:4-8px",
					aurora: "极光渐变背景（#667eea→#764ba2→#f093fb 135deg）毛玻璃卡片 text:#fff accent:#f472b6 大圆角 20px",
					cream: "bg:#faf6f1 surface:#fff text:#3d3128 accent:#e07a5f 大字重标题 软阴影（0 8px 24px rgba(0,0,0,.06)） radius:18px 温暖感",
					clay: "3D 软塑：bg:#f0f4ff 饱和色块（#ffd166/#06d6a0/#4cc9f0）厚圆角 24px 内外阴影组合 text:#1d2b53",
					brutal: "高对比：bg:#fff 硬边框 3px solid #000 鲜艳色块（#ff6b6b/#ffd93d/#6bcB77）offset 阴影 4px 4px 0 #000 粗体无衬线",
					padflow: "侧栏 280px + 内容区双栏 bg:#f8fafc surface:#fff accent:#0ea5e9 大触控目标（按钮高 ≥44px） radius:12px"
				};
				return tokens[id] ?? tokens.clean;
			}
			function productOf(id) {
				return products.find((p) => p.id === id);
			}
			/** 当前导图的 v2 图（旧数据就地转换）；「全部导图」时退回产品镜像（旧版单导图）。 */
			function mapGraph() {
				const map = activeMap();
				if (map !== void 0) {
					if (map.graph !== void 0 && Array.isArray(map.graph.nodes)) return map.graph;
					return productGraphFromV1(map.mindmap || "{\"nodes\":[]}", map.name).graph;
				}
				const product = productOf(productSelected);
				return productGraphFromV1(product?.mindmap || "{\"nodes\":[]}", product?.name ?? "产品").graph;
			}
			function productNodes(_product) {
				return mapGraph().nodes;
			}
			function productNodeById(_product, id) {
				if (!id) return void 0;
				return mapGraph().nodes.find((n) => n.id === id);
			}
			function productFeatureNodes(_product) {
				return productNodes().filter((n) => n.kind !== "root");
			}
			function productDefaultPicked(_product) {
				return new Set(productFeatureNodes().filter((n) => n.kind === "feature").map((n) => n.id));
			}
			function productSelectedFeatures(product) {
				return productFeatureNodes(product).filter((n) => productPicked.has(n.id));
			}
			/** 当前作用域内（选中导图 / 全部导图）的笔记。 */
			function productNoteList(product) {
				if (!product) return [];
				const list = notes.filter((n) => n.notebookId === product.notebookId);
				if (productMapScopeAll || productMapSelected === "") return list;
				return list.filter((note) => note.mapId === void 0 || note.mapId === "" || note.mapId === productMapSelected);
			}
			function productDemoList(product) {
				if (!product) return [];
				const list = productDemos.filter((d) => d.productId === product.id);
				if (productMapScopeAll || productMapSelected === "") return list;
				return list.filter((demo) => demo.mapId === void 0 || demo.mapId === "" || demo.mapId === productMapSelected);
			}
			function productModuleList(product) {
				if (!product) return [];
				const list = productModules.filter((m) => m.productId === product.id);
				if (productMapScopeAll || productMapSelected === "") return list;
				return list.filter((m) => m.mapId === void 0 || m.mapId === "" || m.mapId === productMapSelected);
			}
			function scopedLabel() {
				if (productMapScopeAll || productMapSelected === "") return "全部导图";
				return activeMap()?.name ?? "当前导图";
			}
			async function loadVendorScript(src, id) {
				const exists = document.getElementById(id);
				if (exists !== null) {
					if (exists.dataset.loaded === "1") return;
					await new Promise((resolve, reject) => {
						exists.addEventListener("load", () => resolve(), { once: true });
						exists.addEventListener("error", () => reject(/* @__PURE__ */ new Error("加载失败")), { once: true });
					});
					return;
				}
				await new Promise((resolve, reject) => {
					const el = document.createElement("script");
					el.id = id;
					el.src = src;
					el.async = true;
					el.onload = () => {
						el.dataset.loaded = "1";
						resolve();
					};
					el.onerror = () => reject(/* @__PURE__ */ new Error(`加载失败：${src}`));
					document.head.appendChild(el);
				});
			}
			/** mind-elixir 的 data-nodeid 可能带 me 前缀，按「精确命中优先、去前缀次之」还原图 id。 */
			function productGraphIdOf(raw) {
				if (raw === "") return "";
				const graph = mapGraph();
				if (graph.nodes.some((n) => n.id === raw)) return raw;
				if (raw.startsWith("me") && graph.nodes.some((n) => n.id === raw.slice(2))) return raw.slice(2);
				return raw;
			}
			function renderProductMap(_product) {
				const preview = productMapPreview;
				return `${preview === null ? "" : `<div class="pm-preview-bar"><b>只读预览 v${preview.seq} · ${esc(preview.label)}</b><span>${esc(preview.summary || preview.source)} · ${preview.nodeCount} 节点</span>
      <button class="btn tiny" data-act="pm-version-rollback" data-id="${preview.id}">回滚到此版本</button>
      <button class="btn tiny" data-act="pm-version-delete" data-id="${preview.id}">删除此版本</button>
      <button class="btn tiny" data-act="pm-version-back">退出预览</button></div>`}<div class="pm-plot-wrap"><div id="pm-plot" class="pm-plot"></div></div>`;
			}
			/** 等容器拿到真实尺寸（最多 10 帧），避免 mind-elixir 按 0 宽初始化成乱图。 */
			function waitForPlotSize(el) {
				return new Promise((resolve) => {
					let frames = 0;
					const tick = () => {
						if (el.clientWidth > 40 && el.clientHeight > 40) {
							resolve();
							return;
						}
						frames += 1;
						if (frames >= 10) {
							resolve();
							return;
						}
						window.requestAnimationFrame(tick);
					};
					window.requestAnimationFrame(tick);
				});
			}
			function disposeProductEngines() {
				if (productMind !== null) {
					try {
						productMind.destroy();
					} catch {}
					productMind = null;
				}
				if (productChart !== null) {
					try {
						productChart.dispose();
					} catch {}
					productChart = null;
				}
			}
			/** 挂载画布：每次渲染后调用（renderContent 会重建 DOM，实例必须跟着重建）。 */
			async function mountProductCanvas() {
				const target = $id("pm-plot");
				if (target === null) return;
				disposeProductEngines();
				const preview = productMapPreview;
				if (preview !== null || productMapEngine === "force") {
					await renderProductForce(target, preview?.graph ?? mapGraph());
					return;
				}
				await renderProductTree(target);
			}
			async function renderProductTree(target) {
				if (productMindLoading === null) productMindLoading = (async () => {
					await loadVendorScript(`${API}/assets/vendor/mind-elixir/MindElixir.iife.js`, "dsh-wb-mind-elixir");
					if (shadow.getElementById("dsh-wb-mind-css") === null) {
						const link = document.createElement("link");
						link.id = "dsh-wb-mind-css";
						link.rel = "stylesheet";
						link.href = `${API}/assets/vendor/mind-elixir/MindElixir.css`;
						shadow.appendChild(link);
					}
				})();
				try {
					await productMindLoading;
				} catch (cause) {
					console.warn("[dsh-workbench] 导图编辑器加载失败：", cause);
					target.innerHTML = "<div class=\"notes-empty small\">导图编辑器（mind-elixir）加载失败，请刷新重试。</div>";
					return;
				}
				const ns = window.MindElixir;
				const cls = ns?.default ?? ns;
				if (typeof cls !== "function") {
					target.innerHTML = "<div class=\"notes-empty small\">mind-elixir 未就绪</div>";
					return;
				}
				target.innerHTML = "";
				const container = document.createElement("div");
				container.className = "pm-mind";
				container.style.cssText = "width:100%;height:100%";
				target.appendChild(container);
				await waitForPlotSize(target);
				const dark = resolvedTheme() === "dark";
				productMind = new cls({
					el: container,
					direction: cls.RIGHT,
					toolBar: false,
					keypress: true,
					contextMenu: false,
					overflowHidden: false,
					theme: dark ? cls.DARK_THEME : cls.THEME
				});
				productMind.init(toMindElixir(mapGraph()));
				try {
					productMind.toCenter?.();
				} catch {}
				productMind.bus.addListener("operation", () => scheduleProductMindSync());
			}
			async function renderProductForce(target, graph) {
				try {
					await loadVendorScript(`${API}/assets/vendor/echarts.min.js`, "dsh-wb-echarts");
				} catch (cause) {
					console.warn("[dsh-workbench] 力导图引擎加载失败：", cause);
					target.innerHTML = "<div class=\"notes-empty small\">关系图（ECharts）加载失败，请刷新重试。</div>";
					return;
				}
				const ns = window.echarts;
				if (typeof ns?.init !== "function") {
					target.innerHTML = "<div class=\"notes-empty small\">ECharts 未就绪</div>";
					return;
				}
				productChart = ns.init(target, null, { renderer: "canvas" });
				productChart.on("click", (params) => {
					if (params?.dataType !== "node" || typeof params.data?.id !== "string" || productMapPreview !== null) return;
					const id = String(params.data.id);
					const sep = id.indexOf(":");
					if (sep > 0) {
						const targetMap = id.slice(0, sep);
						const targetNode = id.slice(sep + 1);
						if (productMaps.some((m) => m.id === targetMap)) {
							productMapSelected = targetMap;
							productNodeSelected = targetNode;
							productMapScopeAll = false;
							loadMapVersions().then(() => renderContent());
							toast("已跳到引用的导图");
						}
						return;
					}
					productNodeSelected = id;
				});
				productChart.setOption(buildProductForceOption(graph, { dark: resolvedTheme() === "dark" }), true);
				const legend = document.createElement("div");
				legend.className = "pm-force-legend";
				legend.innerHTML = [...new Set(graph.nodes.map((n) => n.kind))].map((kind) => `<span><i style="background:${PRODUCT_KIND_COLOR[kind]}"></i>${PRODUCT_KIND_LABEL[kind]}</span>`).join("") + (externalEdges(graph).length > 0 ? "<span><i class=\"ext\"></i>跨图引用</span>" : "");
				target.appendChild(legend);
				const hint = document.createElement("div");
				hint.className = "pm-force-hint";
				hint.textContent = "悬停高亮相邻 · 拖动节点 · 滚轮缩放 · 虚线 = 关联 / 跨图引用";
				target.appendChild(hint);
			}
			function persistProductGraph() {
				const map = activeMap();
				if (map === void 0) return Promise.resolve();
				productPersistChain = productPersistChain.then(() => sendMapDraft(map));
				return productPersistChain;
			}
			async function sendMapDraft(map) {
				try {
					const res = await fetch(`${API}/products/maps/draft`, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							mapId: map.id,
							graph: map.graph,
							rev: map.graphRev
						})
					});
					const data = await res.json().catch(() => ({}));
					if (res.status === 409 && data.current) {
						Object.assign(map, data.current);
						toast("导图已在别处更新，已重新载入");
						renderContent();
						return;
					}
					if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
					map.graphRev = Number(data.rev ?? map.graphRev);
					if (data.map) Object.assign(map, data.map);
				} catch (cause) {
					toast(`导图保存失败：${String(cause.message ?? cause)}`);
				}
			}
			/** mind-elixir 编辑防抖同步：结构/文案变化 → 回写图 → 落草稿。 */
			function scheduleProductMindSync() {
				if (productMindSyncTimer !== 0) window.clearTimeout(productMindSyncTimer);
				productMindSyncTimer = window.setTimeout(() => {
					productMindSyncTimer = 0;
					if (productMind === null) return;
					const map = activeMap();
					if (map === void 0 || productMapPreview !== null) return;
					try {
						map.graph = fromMindElixir(productMind.getData(), map.graph);
						persistProductGraph();
					} catch (cause) {
						console.warn("[dsh-workbench] 导图同步失败", cause);
					}
				}, 450);
			}
			function renderProduct() {
				const product = productOf(productSelected);
				const header = `<div class="view-head"><div><div class="eyebrow">产品设计</div><h1 class="page-title">产品</h1>
      <div class="page-sub">导图记录功能，AI 生成设计笔记与多风格 Demo；产物保存到关联工作区</div><div class="head-pills"><span><b>${products.length}</b> 产品</span><span><b>${productModules.length}</b> 模块</span><span><b>${productDemos.length}</b> Demo</span></div></div>
      <div style="display:flex;gap:6px"><button class="btn" data-act="ai-dispatch" data-kind="product">${ic("spark", 13)}AI 协同</button><button class="btn-primary" data-act="product-new">${ic("plus", 14)}新建产品</button></div></div>`;
				if (productError !== "") return header + `<div class="news-banner">${ic("flag", 13)}<span>产品读取失败：${esc(productError)}</span><button class="btn" data-act="product-refresh">重试</button></div>`;
				if (products.length === 0) return header + `<div class="notes-empty bug-empty"><div class="ne-icon">${ic("product", 22)}</div><b>还没有产品项目</b><span>创建一个产品并关联工作区，用导图梳理功能，再让 AI 生成设计笔记和 Demo。</span><button class="btn-primary" data-act="product-new">${ic("plus", 14)}新建产品</button></div>`;
				if (!product) return header;
				const toolbar = `<div class="product-toolbar">
      <select id="wb-product-select" class="bug-project-select"><option value="">选择产品…</option>${products.map((p) => `<option value="${p.id}" ${p.id === product.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <button class="icon-btn" data-act="product-edit" title="编辑产品">${ic("edit", 14)}</button>
      <span class="product-ws">${ic("folder", 12)}${esc(product.workspacePath || "未关联工作区")}</span>
      <button class="icon-btn" data-act="product-refresh" title="刷新">${ic("refresh", 14)}</button>
    </div>`;
				const scopeSelect = productTab === "map" || productMaps.length <= 1 ? "" : `<select id="wb-map-scope" class="bug-project-select" title="导图范围">
        <option value="all"${productMapScopeAll ? " selected" : ""}>全部导图（${productMaps.length}）</option>
        ${productMaps.map((map) => `<option value="${map.id}"${!productMapScopeAll && map.id === productMapSelected ? " selected" : ""}>${esc(map.name)}</option>`).join("")}
      </select>`;
				const tabs = `<div class="product-tabs">
      ${[
					"map",
					"notes",
					"modules",
					"demo"
				].map((tab) => `<button class="${productTab === tab ? "active" : ""}" data-act="product-tab" data-tab="${tab}">${tab === "map" ? `思维导图（${productMaps.length}）` : tab === "notes" ? `设计笔记（${productNoteList(product).length}）` : tab === "modules" ? `模块（${productModuleList(product).length}）` : `Demo（${productDemoList(product).length}）`}</button>`).join("")}
      ${scopeSelect}
    </div>`;
				let body = "";
				if (productTab === "map") body = `<div class="pm-map-wrap">${`<aside class="pm-maps">
        <div class="pm-maps-head"><b>导图</b><span>${productMaps.length}</span><button class="icon-btn" data-act="pm-map-new" title="新建导图（自建 / 导入 / 从灵感）">${ic("plus", 13)}</button></div>
        ${productMaps.length === 0 ? `<div class="pm-maps-empty">${productMapsReady ? "还没有导图，点 + 新建（自建 / 导入大纲 / 从灵感选择）" : "多导图不可用（宿主未更新）"}</div>` : productMaps.map((map) => `<div class="pm-map${map.id === productMapSelected ? " active" : ""}" data-act="pm-map-select" data-id="${map.id}" title="${esc(map.description || map.name)}">
          <b>${esc(map.name)}</b><small>${mapNodeCount(map)} 节点 · ${productNoteListOfMap(map.id).length} 笔记 · ${mapVersionSeq(map)}${mapRefCount(map) === "" ? "" : ` · ${mapRefCount(map)}`}</small>
          <small class="pm-map-src">${mapSourceLabel(map)}</small>
          <span class="pm-map-ops"><button class="icon-btn" data-act="pm-map-rename" data-id="${map.id}" title="重命名">${ic("edit", 11)}</button><button class="icon-btn" data-act="pm-map-delete" data-id="${map.id}" title="删除导图">${ic("trash", 11)}</button></span>
        </div>`).join("")}
        ${productMapSelected === "" ? "" : renderVersionPanel()}
      </aside>`}<div class="pm-map-main"><div class="product-map-toolbar">
        ${`<div class="mini-seg pm-engine-seg" title="画布引擎">
        <button data-act="pm-engine" data-mode="tree" class="${productMapEngine === "tree" && productMapPreview === null ? "active" : ""}">编辑</button>
        <button data-act="pm-engine" data-mode="force" class="${productMapEngine === "force" && productMapPreview === null ? "active" : ""}">关系</button>
      </div>`}
        <button class="btn" data-act="product-node-new" data-type="feature">${ic("plus", 12)}新增功能</button>
        <button class="btn" data-act="product-node-new" data-type="requirement">${ic("plus", 12)}新增需求</button>
        <button class="btn" data-act="product-node-child">${ic("corner", 12)}加子节点</button>
        <button class="btn" data-act="product-node-sibling">${ic("plus", 12)}加同级</button>
        <button class="btn" data-act="product-node-edit">${ic("edit", 12)}编辑节点</button>
        <button class="icon-btn" data-act="product-node-delete" title="删除节点（Del）">${ic("trash", 13)}</button>
        <span class="pm-sep"></span>
        <button class="btn" data-act="pm-version-archive">${ic("layers", 12)}存档版本</button>
        <button class="btn" data-act="pm-version-diff">版本对比</button>
        <span class="pm-sep"></span>
        <button class="btn" data-act="pm-export-outline">${ic("download", 12)}导出大纲</button>
        <button class="btn" data-act="pm-import-outline">${ic("upload", 12)}导入大纲</button>
        <button class="btn" data-act="pm-import-idea">${ic("spark", 12)}从灵感导入</button>
        <span class="product-hint">${ic("folder", 11)} ${esc(productMapSelected !== "" ? `.dsh-workbench/products/${product.id}/maps/${productMapSelected}.json` : "mindmap.json → " + (product.workspacePath || "未关联工作区"))}</span>
      </div>${renderProductMap(product)}</div></div>`;
				else if (productTab === "notes") {
					const featureNodes = productFeatureNodes(product);
					const picked = featureNodes.filter((n) => productPicked.has(n.id));
					body = `<div class="product-panel-head"><div><b>设计笔记</b><span>${esc(scopedLabel())} · ${picked.length > 0 ? `已勾选 ${picked.length} 个功能/需求，生成将覆盖勾选项` : `未勾选，生成将覆盖全部 ${featureNodes.length} 个`}</span></div><div class="product-actions"><button class="btn" data-act="flow-gen-tests">${ic("arrowR", 12)}生成测试用例</button><button class="btn-primary" data-act="product-gen-notes">${ic("spark", 12)}AI 生成设计笔记</button></div></div>
        <div class="product-pick-list">${featureNodes.map((n) => `<label><input type="checkbox" data-act="product-pick" data-id="${n.id}" ${productPicked.has(n.id) ? "checked" : ""}> ${esc(n.label)}</label>`).join("") || "<span class=\"muted\">先添加功能节点</span>"}</div>
        <div class="product-note-list">${productNoteList(product).map((note) => `<div class="product-note" data-product-note="${note.id}"><b>${esc(note.title)}</b><span>${esc(note.content.replace(/[#>*\n]/g, " ").slice(0, 100))}</span><i>${note.filePath ? "已写入工作区" : "仅本地库"}</i></div>`).join("") || "<div class=\"notes-empty small\">还没有设计笔记，点右上角 AI 生成。</div>"}</div>`;
				} else if (productTab === "modules") {
					const mods = productModuleList(product);
					const kindName = (k) => k === "module" ? "模块" : k === "business" ? "业务" : k === "feature" ? "功能" : "需求";
					body = `<div class="product-panel-head"><div><b>模块 / 业务 / 功能 / 需求</b><span>产品 → 模块 → 业务 → 功能 / 需求；端：PC / 移动 / 平板 / 全部</span></div><button class="btn-primary" data-act="product-gen-modules">${ic("spark", 12)}AI 生成模块与详细设计</button></div>
        <div class="module-coverage"><b>${mods.length}</b> 节点${[
						"all",
						"pc",
						"mobile",
						"tablet"
					].map((p) => `<span>${platformLabel(p)} ${mods.filter((m) => m.platform === p).length}</span>`).join("")}<span class="bar">${[
						"all",
						"pc",
						"mobile",
						"tablet"
					].map((p, i) => `<i style="width:${mods.length ? Math.round(mods.filter((m) => m.platform === p).length / mods.length * 100) : 0}%;background:${[
						"var(--accent)",
						"var(--green)",
						"var(--orange)",
						"var(--amber)"
					][i]}"></i>`).join("")}</span></div>
        <div class="module-grid">${mods.map((m) => `<div class="module-card ${m.kind}" data-act="product-module-detail" data-id="${m.id}" title="${esc(m.name)}"><div><span class="module-kind">${kindName(m.kind)}</span><b>${esc(m.name)}</b><i class="platform ${m.platform}">${m.platform.toUpperCase()}</i></div><p>${esc(m.description || "待补充模块说明")}</p><small>${esc(m.status)}${m.noteId ? " · 已关联笔记" : ""}</small></div>`).join("") || "<div class=\"notes-empty small\">还没有模块，点右上角 AI 生成；AI 会按产品导图拆分模块并逐模块生成详细设计笔记。</div>"}</div>`;
				} else {
					const demos = productDemoList(product);
					const current = demos.find((d) => d.id === productDemoSelected) ?? demos[0];
					const themeOptions = (group) => PRODUCT_STYLES.filter((t) => group === "all" ? t.platform === "all" : t.platform === group || t.platform === "all").map((t) => `<option value="${t.id}" ${productStyle === t.id ? "selected" : ""}>${t.name}${t.popular ? " · 流行" : ""}</option>`).join("");
					const prog = demoProgress && demoProgress.productId === product.id && demoProgress.updatedAt !== demoProgressDismissedAt ? demoProgress : null;
					body = `<div class="product-panel-head"><div><b>产品 Demo</b><span>来源：设计笔记 + 灵感 · 单页 / 产品系统 · ${platformLabel(productPlatform)} · ${themeOf(productStyle).name}</span></div><div class="product-actions">
        <select id="wb-product-platform" class="notes-nb-select" title="目标端"><option value="all" ${productPlatform === "all" ? "selected" : ""}>自适应</option><option value="pc" ${productPlatform === "pc" ? "selected" : ""}>PC</option><option value="mobile" ${productPlatform === "mobile" ? "selected" : ""}>移动端</option><option value="tablet" ${productPlatform === "tablet" ? "selected" : ""}>平板</option></select>
        <select id="wb-product-kind" class="notes-nb-select" title="Demo 形态"><option value="page" ${productDemoKind === "page" ? "selected" : ""}>单页面</option><option value="system" ${productDemoKind === "system" ? "selected" : ""}>产品系统（多页）</option></select>
        <select id="wb-product-style" class="notes-nb-select" title="UI 主题"><optgroup label="通用">${themeOptions("all")}</optgroup><optgroup label="PC 主题">${themeOptions("pc")}</optgroup><optgroup label="移动端主题">${themeOptions("mobile")}</optgroup><optgroup label="平板主题">${themeOptions("tablet")}</optgroup></select>
        <button class="btn" data-act="product-gen-demo-ai">${ic("spark", 12)}AI 深度生成</button>
        <button class="btn-primary" data-act="product-gen-demo" data-scope="all">${ic("play", 12)}快速渲染</button>
        ${productSelectedFeatures(product).length > 0 ? `<button class="btn" data-act="product-gen-demo" data-scope="feature" title="为每个勾选的功能/需求各生成一个 Demo">${ic("play", 12)}按勾选渲染（${productSelectedFeatures(product).length}）</button>` : ""}
      </div></div>
      ${prog ? `<div class="demo-progress ${prog.status}"><div class="demo-progress-head"><b>生成进度</b><span>${prog.status === "running" ? `${prog.step}/${prog.total} · ${esc(prog.message)}` : prog.status === "done" ? `已完成 · ${esc(prog.message)}` : `失败 · ${esc(prog.message)}`}</span><button class="icon-btn" data-act="demo-progress-clear" title="关闭">✕</button></div><div class="demo-progress-bar"><i style="width:${prog.total > 0 ? Math.min(100, Math.round(prog.step / prog.total * 100)) : prog.status === "done" ? 100 : 8}%"></i></div>${prog.log.length > 0 ? `<div class="demo-progress-log">${prog.log.slice(-5).map((l) => `<div><i>${(l.at ?? "").slice(11, 16)}</i>${esc(l.message)}</div>`).join("")}</div>` : ""}</div>` : ""}
        <div class="product-demo-layout"><div class="product-demo-list">${demos.map((d) => `<div class="product-demo-row${current?.id === d.id ? " active" : ""}" data-product-demo="${d.id}"><b>${esc(d.title)}</b><span>${themeOf(d.style).name} · ${d.kind === "system" ? "产品系统" : "单页"} · ${platformLabel(d.platform ?? "all")} · ${d.createdAt.slice(5, 16)}</span><button class="icon-btn" data-act="product-demo-delete" data-id="${d.id}" title="删除 Demo">${ic("trash", 11)}</button></div>`).join("") || "<div class=\"notes-empty small\">还没有 Demo：「快速渲染」本地即时生成，或「AI 深度生成」结合灵感做出可交互原型。</div>"}</div><div class="product-demo-preview">${current ? `<div class="demo-viewport-bar">${[
						"pc",
						"tablet",
						"mobile"
					].map((v) => `<button class="${demoViewport === v ? "on" : ""}" data-act="demo-viewport" data-v="${v}">${v === "pc" ? "PC" : v === "tablet" ? "平板" : "移动"}</button>`).join("")}<span>${esc(themeOf(current.style).hint)}</span></div><iframe class="demo-frame demo-frame-${demoViewport}" sandbox="allow-scripts allow-forms allow-modals" src="${API}/products/demo?id=${encodeURIComponent(current.id)}&v=${encodeURIComponent(current.createdAt)}" title="产品 Demo"></iframe>` : "<div class=\"notes-empty small\">生成后在这里预览</div>"}</div></div>`;
				}
				return header + toolbar + tabs + body;
			}
			async function loadProductMaps() {
				const product = productOf(productSelected);
				if (product === void 0) {
					productMaps = [];
					productMapSelected = "";
					return;
				}
				try {
					const res = await fetch(`${API}/products/maps?productId=${encodeURIComponent(product.id)}`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					productMaps = Array.isArray(data.maps) ? data.maps : [];
					productMapsReady = true;
				} catch (cause) {
					productMaps = [];
					productMapsReady = false;
					console.warn("[dsh-workbench] 导图清单读取失败：", cause);
				}
				if (productMaps.length > 0 && !productMaps.some((map) => map.id === productMapSelected)) productMapSelected = productMaps[0].id;
				if (productMaps.length === 0) productMapSelected = "";
				if (productMapPreview !== null && productMapPreview.mapId !== productMapSelected) productMapPreview = null;
				await loadMapVersions();
			}
			/** 当前导图；'' 表示「全部导图」。 */
			function activeMap() {
				return productMapSelected === "" ? void 0 : productMaps.find((map) => map.id === productMapSelected);
			}
			/** 导图 JSON（v2 图）：AI 提示词与导入导出统一用它。 */
			function mapMindmap() {
				return JSON.stringify(mapGraph());
			}
			/** 某张导图下的产品笔记数（用于导图清单副标题）。 */
			function productNoteListOfMap(mapId) {
				const product = productOf(productSelected);
				if (product === void 0) return [];
				return notes.filter((n) => n.notebookId === product.notebookId && n.mapId === mapId);
			}
			function mapNodeCount(map) {
				if (map.graph !== void 0 && Array.isArray(map.graph.nodes)) return map.graph.nodes.length;
				try {
					const parsed = JSON.parse(map.mindmap || "{\"nodes\":[]}");
					return Array.isArray(parsed.nodes) ? parsed.nodes.length : 0;
				} catch {
					return 0;
				}
			}
			/** 导图卡片的版本徽标。 */
			function mapVersionSeq(map) {
				const seq = productMapVersions.find((v) => v.mapId === map.id && v.id === map.currentVersionId)?.seq;
				if (seq !== void 0) return `v${seq}`;
				return map.currentVersionId !== void 0 && map.currentVersionId !== "" ? "已存档" : "无版本";
			}
			function mapSourceLabel(map) {
				if (map.source === "idea") return `灵感导入${map.sourceRef ? ` · ${map.sourceRef.slice(0, 18)}` : ""}`;
				if (map.source === "outline") return "大纲导入";
				if (map.source === "ai") return "AI 生成";
				return "自建";
			}
			/** 跨图引用计数：引用 = 本图指向他图；被引用 = 他图指向本图（「互为补充」的量化）。 */
			function mapRefCount(map) {
				const graph = map.graph;
				if (graph === void 0 || !Array.isArray(graph.edges)) return "";
				const out = externalEdges(graph).length;
				let inbound = 0;
				for (const other of productMaps) {
					if (other.id === map.id || other.graph === void 0 || !Array.isArray(other.graph.edges)) continue;
					inbound += externalEdges(other.graph).filter((e) => String(e.to).startsWith(`${map.id}:`)).length;
				}
				return out === 0 && inbound === 0 ? "" : `引用 ${out} · 被引用 ${inbound}`;
			}
			function mapSourceText(source) {
				return source === "idea" ? "灵感导入" : source === "outline" ? "大纲导入" : source === "ai" ? "AI" : source === "rollback" ? "回滚" : source === "migration" ? "迁移" : "手工";
			}
			/** 版本面板（参照灵感右侧版本区：只读预览 / 回滚 / 删除）。 */
			function renderVersionPanel() {
				return `<div class="pm-versions">
      <div class="pm-maps-head"><b>版本</b><span>${productMapVersions.length}</span></div>
      ${productMapVersions.length === 0 ? "<div class=\"pm-maps-empty\">「存档版本」后出现历史</div>" : productMapVersions.slice(0, 12).map((v) => `<div class="pm-version${productMapPreview?.id === v.id ? " active" : ""}">
        <b>v${v.seq} · ${esc(v.label)}</b><small>${mapSourceText(v.source)} · ${v.nodeCount} 节点 · ${(v.createdAt ?? "").slice(5, 16)}</small>
        <span class="pm-map-ops">
          <button class="icon-btn" data-act="pm-version-preview" data-id="${v.id}" title="只读预览">${ic("play", 11)}</button>
          <button class="icon-btn" data-act="pm-version-rollback" data-id="${v.id}" title="回滚到此版本">${ic("refresh", 11)}</button>
          <button class="icon-btn" data-act="pm-version-delete" data-id="${v.id}" title="删除版本">${ic("trash", 11)}</button>
        </span>
      </div>`).join("")}
    </div>`;
			}
			/** 拉取当前导图的版本序列。 */
			async function loadMapVersions() {
				if (productMapSelected === "") {
					productMapVersions = [];
					return;
				}
				try {
					const res = await fetch(`${API}/products/maps/versions?mapId=${encodeURIComponent(productMapSelected)}`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					productMapVersions = Array.isArray(data.versions) ? data.versions : [];
				} catch (cause) {
					productMapVersions = [];
					console.warn("[dsh-workbench] 版本清单读取失败：", cause);
				}
			}
			async function loadProducts(silent = false) {
				if (productLoading) return;
				productLoading = true;
				if (!silent) {
					productError = "";
					if (ui.view === "product") renderContent();
				}
				try {
					const [pRes, nRes] = await Promise.all([fetch(`${API}/products`), fetch(`${API}/notes`)]);
					if (!pRes.ok || !nRes.ok) throw new Error(`HTTP ${pRes.status}/${nRes.status}`);
					const pData = await pRes.json();
					const nData = await nRes.json();
					products = Array.isArray(pData.products) ? pData.products : [];
					productDemos = Array.isArray(pData.demos) ? pData.demos : [];
					productModules = Array.isArray(pData.modules) ? pData.modules : [];
					notes = Array.isArray(nData.notes) ? nData.notes : notes;
					notebooks = Array.isArray(nData.notebooks) ? nData.notebooks : notebooks;
					if (productSelected === null || productOf(productSelected) === void 0) productSelected = products[0]?.id ?? null;
					await loadProductMaps();
					const product = productOf(productSelected);
					if (product && productPicked.size === 0) productPicked = productDefaultPicked(product);
					try {
						const gRes = await fetch(`${API}/products/demo-progress?productId=${encodeURIComponent(productSelected ?? "")}`);
						if (gRes.ok) demoProgress = (await gRes.json()).progress ?? null;
					} catch {}
					productError = "";
				} catch (cause) {
					if (!silent) productError = String(cause.message ?? cause);
				}
				productLoading = false;
				if (ui.view !== "product") return;
				const sig = JSON.stringify({
					p: products.map((p) => [
						p.id,
						p.name,
						p.updatedAt,
						p.mindmap.length
					]),
					d: productDemos.map((d) => [d.id, d.createdAt]),
					n: notes.length,
					g: [
						demoProgress?.step,
						demoProgress?.status,
						demoProgress?.message
					]
				});
				if (!silent || sig !== productSig) {
					productSig = sig;
					if (($id("wb-modal")?.innerHTML ?? "") === "") renderContent();
				}
			}
			function productPrompt(product, mode, scope, opts) {
				productNodes(product);
				const picked = productSelectedFeatures(product);
				const features = (scope === "feature" ? picked : productFeatureNodes(product)).map((n) => `- ${n.id} [${kindLabel(n.kind)}] ${n.label}`).join("\n");
				const theme = themeOf(productStyle);
				const kind = opts?.kind ?? "page";
				const platform = opts?.platform ?? "all";
				const map = activeMap();
				const mapId = productMapSelected;
				const mapLine = map === void 0 ? "导图：整产品（旧版单导图）" : `导图：${map.name}（mapId: ${map.id}）${map.description ? ` — ${map.description}` : ""}\n同一产品可有多张导图，本次只处理这一张，写入时必须带 mapId:"${map.id}"。`;
				const mapArg = mapId === "" ? "" : `, mapId:"${mapId}"`;
				const common = `产品：${product.name}\n简介：${product.description || "未填写"}\n工作区绝对路径：${product.workspacePath}\n产品 ID：${product.id}\n产品笔记本 ID：${product.notebookId}\n${mapLine}\n\n导图 JSON：\n${mapMindmap()}\n\n本次覆盖节点：\n${features || "- （整个产品）"}`;
				if (mode === "modules") return `产品模块化与详细设计任务：${product.name}\n\n你是资深产品架构师。请把产品拆成「产品 → 模块 → 业务 → 功能 / 需求」，并为每个模块生成详细设计笔记。\n\n${common}\n\n要求：\n1. 先调用 workbench_module_publish 写模块/业务/功能/需求，参数 { productId:"${product.id}"${mapArg}, parentId:"父节点 id（模块为空）", name, kind:"module|business|feature|requirement", platform:"pc|mobile|tablet|all", description }。\n2. 每个模块调用 workbench_product_note_publish 生成详细设计笔记，参数包含 productId${mapArg}、moduleId、platform、title、content。\n3. 笔记结构：模块背景 / 范围 / 平台差异 / 信息架构 / 核心流程 / 状态 / 数据与接口 / 权限 / 边界 / 验收。\n4. 模块划分按业务能力，不按页面；平台差异明确写出 PC / 移动 / 平板分别的交互。\n5. 不要只回复正文；必须调用工具；完成后汇总模块清单。`;
				if (mode === "notes") return `产品设计笔记任务：${product.name}\n\n你是资深产品经理。请基于下面的产品导图和上下文，为每个功能/需求生成独立的设计笔记。\n\n${common}\n\n要求：\n1. 每个功能/需求调用一次工具 workbench_product_note_publish。\n2. 参数：{ productId:"${product.id}"${mapArg}, featureId:"节点 id", title:"功能名 + 设计笔记", content:"完整 Markdown", tags:["产品设计"] }。\n3. 笔记结构固定：背景 / 目标 / 用户故事 / 核心流程 / 交互与状态 / 边界与异常 / 验收标准。\n4. 多写具体交互、状态与验收，不要写空泛套话；不要遗漏节点。\n5. 全部写完后用简短清单汇报。\n6. 不修改工作区其他文件；笔记由工具负责落库与工作区 Markdown。`;
				const platformLabelMap = {
					pc: "PC（宽屏 1280+，侧栏导航、多栏信息密度）",
					mobile: "移动端（375-430px，单列、底部导航、大触控目标）",
					tablet: "平板（768-1024px，双栏自适应、大间距）",
					all: "自适应（移动优先，PC 增强）"
				};
				return `产品 Demo 生成任务：${product.name}

你是资深前端原型工程师 + 产品设计师。请依据产品设计笔记与灵感资料，生成高保真、可交互的 Demo。

${common}

【Demo 规格】
- 形态：${kind === "system" ? "产品系统（多页）：单文件 HTML 内用左侧/顶部导航切换页面，每页是完整界面（含列表/表单/详情等真实布局），页面间可跳转" : "单页面：一个完整界面或长页分区锚点"}
- 目标端：${platformLabelMap[platform] ?? platformLabelMap.all}
- UI 主题：${theme.name}（${theme.id}）— ${theme.hint}
  设计令牌：${themeTokens(theme.id)}
- 覆盖范围：${scope === "feature" ? "按勾选功能逐个生成" : "整个产品"}

【进度上报（硬性要求）】
开始前调用 workbench_demo_progress_publish { productId:"${product.id}", step:0, total:4, status:"running", message:"分析笔记与灵感" }；
之后每完成一个里程碑调用一次（step 1..4：设计信息架构 → 搭建框架与主题 → 实现页面与交互 → 自检与收尾），最后 status:"done"。

【交付要求】
1. **唯一交付方式**：调用 workbench_product_demo_publish，参数 { productId:"${product.id}"${mapArg}, scope:"${scope}", kind:"${kind}", platform:"${platform}", style:"${theme.id}", featureId:"功能 id（scope=feature 时）", title:"Demo 标题", html:"完整 HTML" }。
2. **禁止**用 write/edit/bash 直接写 HTML 文件；**禁止**委派子智能体；**禁止**只把 HTML 贴在回复里。若工具不可用，停止并说明原因。
3. HTML 必须是单文件、内联 CSS/JS、无外部依赖；真实文案（不要 Lorem）；可点击交互（Tab 切换、弹窗、表单态、筛选等至少 3 类）。
4. 严格使用所选主题的设计令牌与风格；${kind === "system" ? "系统形态要有统一壳层（顶栏+侧栏+内容区）与至少 3 个页面。" : "单页要有清晰的信息层级与首屏重点。"}
5. 设计笔记描述的核心流程必须能在 Demo 里走通；灵感库的借鉴点选择性融入。
6. 不要修改工作区其他文件。`;
			}
			async function queueProductPrompt(prompt) {
				await dispatchToNewSession(productOf(productSelected)?.workspacePath ?? "", prompt);
			}
			function productNodeId() {
				return `pn-${Math.random().toString(36).slice(2, 8)}`;
			}
			/** 写回当前导图草稿；rerender=false 只刷画布，保住编辑焦点。 */
			function commitMapGraph(graph, opts = {}) {
				const map = activeMap();
				if (map === void 0) return;
				map.graph = normalizeProductGraph(graph, { title: map.name }).graph;
				persistProductGraph();
				if (opts.rerender === true) renderContent();
				else refreshMapCanvas();
			}
			/** 局部刷新画布（renderContent 会重建 DOM，编辑中尽量不整页重渲）。 */
			function refreshMapCanvas() {
				if (productMapPreview !== null || productMapEngine === "force") {
					if (productChart !== null) try {
						productChart.setOption(buildProductForceOption(mapGraph(), { dark: resolvedTheme() === "dark" }), true);
					} catch {}
					return;
				}
				if (productMind !== null) try {
					productMind.refresh(toMindElixir(mapGraph()));
				} catch {}
			}
			const PRODUCT_KIND_OPTIONS = [
				"module",
				"business",
				"feature",
				"requirement"
			];
			function kindLabel(kind) {
				return PRODUCT_KIND_LABEL[kind];
			}
			function openNodeQuickAdd(kind, type = "feature") {
				const graph = mapGraph();
				const selected = productNodeById(void 0, productNodeSelected);
				let parentId = graph.rootId;
				if (kind === "child" && selected !== void 0) parentId = selected.id;
				if (kind === "sibling" && selected !== void 0) {
					if (selected.kind === "root") {
						toast("根节点不能加同级");
						return;
					}
					parentId = selected.parentId ?? graph.rootId;
				}
				openModal(`<h3>${kind === "child" ? "添加子节点" : "添加同级节点"}</h3>
      <div class="mfield"><label>名称</label><input id="wb-pn-label" placeholder="例如：登录 / 支持手机号登录"></div>
      <div class="mfield"><label>类型</label><select id="wb-pn-type">${PRODUCT_KIND_OPTIONS.map((k) => `<option value="${k}" ${k === type ? "selected" : ""}>${kindLabel(k)}</option>`).join("")}</select></div>
      <div class="mfield"><label>上级节点</label><select id="wb-pn-parent">${graph.nodes.map((n) => `<option value="${n.id}" ${n.id === parentId ? "selected" : ""}>${esc(n.kind === "root" ? "产品" : `${kindLabel(n.kind)} · ${n.label}`)}</option>`).join("")}</select></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-node-add-quick">添加</button></div>`);
				window.setTimeout(() => $id("wb-pn-label")?.focus(), 0);
			}
			async function saveQuickNode() {
				const graph = mapGraph();
				const label = $id("wb-pn-label")?.value.trim() ?? "";
				if (label === "") {
					$id("wb-pn-label")?.focus();
					return;
				}
				const kind = $id("wb-pn-type")?.value ?? "feature";
				const parentId = $id("wb-pn-parent")?.value ?? graph.rootId;
				const id = productNodeId();
				graph.nodes.push({
					id,
					label,
					kind,
					parentId,
					status: "kept"
				});
				graph.edges.push({
					from: parentId,
					to: id,
					kind: "tree"
				});
				productNodeSelected = id;
				commitMapGraph(graph);
				closeModal();
				renderContent();
				toast(`已添加「${label}」`);
			}
			function toggleNodeFold(id) {
				const graph = mapGraph();
				const node = graph.nodes.find((n) => n.id === id);
				if (node === void 0) return;
				node.collapsed = node.collapsed === true ? void 0 : true;
				commitMapGraph(graph);
				renderContent();
			}
			async function changeNodeKind(id, kind) {
				const graph = mapGraph();
				const node = graph.nodes.find((n) => n.id === id);
				if (node === void 0 || node.kind === "root") return;
				node.kind = kind;
				commitMapGraph(graph);
				renderContent();
				toast(`已改为${kindLabel(kind)}`);
			}
			/** 节点属性编辑：名称 / 类型 / 端 / 状态 / 说明。 */
			function openNodeProperty() {
				const node = productNodeById(void 0, productNodeSelected);
				if (!node) {
					toast("先选中一个节点");
					return;
				}
				if (node.kind === "root") {
					toast("产品根节点请用「编辑产品」");
					return;
				}
				openModal(`<h3>编辑节点</h3>
      <div class="mfield"><label>名称</label><input id="wb-pn-edit-label" value="${esc(node.label)}"></div>
      <div class="mfield"><label>类型</label><select id="wb-pn-edit-kind">${PRODUCT_KIND_OPTIONS.map((k) => `<option value="${k}" ${k === node.kind ? "selected" : ""}>${kindLabel(k)}</option>`).join("")}</select></div>
      <div class="mfield"><label>端</label><select id="wb-pn-edit-platform">${[
					"",
					"all",
					"pc",
					"mobile",
					"tablet"
				].map((p) => `<option value="${p}" ${p === (node.platform ?? "") ? "selected" : ""}>${p === "" ? "未指定" : platformLabel(p)}</option>`).join("")}</select></div>
      <div class="mfield"><label>状态</label><select id="wb-pn-edit-status">${[
					"kept",
					"pending",
					"dropped"
				].map((s) => `<option value="${s}" ${s === (node.status ?? "kept") ? "selected" : ""}>${s === "kept" ? "采纳" : s === "pending" ? "待定" : "放弃"}</option>`).join("")}</select></div>
      <div class="mfield"><label>说明（≤200 字）</label><textarea id="wb-pn-edit-detail" rows="3">${esc(node.detail ?? "")}</textarea></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-node-update" data-id="${node.id}">保存</button></div>`);
			}
			async function updateProductNode(id) {
				const graph = mapGraph();
				const node = graph.nodes.find((n) => n.id === id);
				if (!node) return;
				const label = $id("wb-pn-edit-label")?.value.trim() ?? "";
				if (label === "") return;
				node.label = label;
				node.kind = $id("wb-pn-edit-kind")?.value ?? node.kind;
				const platform = $id("wb-pn-edit-platform")?.value ?? "";
				node.platform = platform === "" ? void 0 : platform;
				node.status = $id("wb-pn-edit-status")?.value ?? "kept";
				node.detail = ($id("wb-pn-edit-detail")?.value ?? "").slice(0, 200);
				commitMapGraph(graph);
				closeModal();
				renderContent();
				toast("节点已更新");
			}
			async function deleteProductNode() {
				const graph = mapGraph();
				const node = productNodeById(void 0, productNodeSelected);
				if (!node) {
					toast("先选中一个节点");
					return;
				}
				if (node.kind === "root") {
					toast("不能删除产品根节点");
					return;
				}
				const doomed = /* @__PURE__ */ new Set([node.id]);
				let changed = true;
				while (changed) {
					changed = false;
					for (const edge of graph.edges) if (edge.kind === "tree" && doomed.has(edge.from) && !doomed.has(edge.to)) {
						doomed.add(edge.to);
						changed = true;
					}
				}
				if (!(typeof window.confirm === "function" ? window.confirm(`删除「${node.label}」及其 ${doomed.size - 1} 个子节点？关联边一并清理。`) : true)) return;
				const next = {
					...graph,
					nodes: graph.nodes.filter((n) => !doomed.has(n.id)),
					edges: graph.edges.filter((e) => !doomed.has(e.from) && !(e.kind === "relate" && doomed.has(e.to)))
				};
				productNodeSelected = null;
				commitMapGraph(next);
				renderContent();
			}
			/** 同图关联 / 跨图引用（relate 边）。 */
			function openRelateModal(nodeId, external = false) {
				const graph = mapGraph();
				const from = graph.nodes.find((n) => n.id === nodeId);
				if (!from) return;
				if (external) {
					const options = productMaps.filter((m) => m.id !== productMapSelected).map((m) => {
						const nodes = (m.graph?.nodes ?? []).filter((n) => n.kind !== "root");
						return nodes.length === 0 ? "" : `<optgroup label="${esc(m.name)}">${nodes.map((n) => `<option value="${m.id}:${n.id}">${esc(kindLabel(n.kind))} · ${esc(n.label)}</option>`).join("")}</optgroup>`;
					}).join("");
					if (options === "") {
						toast("没有其他导图或其节点可引用");
						return;
					}
					openModal(`<h3>加跨图引用</h3>
        <div class="mfield"><label>从「${esc(from.label)}」指向（同产品另一张导图）</label><select id="wb-rel-target">${options}</select></div>
        <div class="mfield"><label>关系说明（可选）</label><input id="wb-rel-label" placeholder="例如：互补 / 依赖"></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">跨图引用是「互为补充」的表达：删除目标导图时引用会自动清理。</div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-relate-save" data-id="${nodeId}" data-ext="1">添加</button></div>`);
					return;
				}
				const candidates = graph.nodes.filter((n) => n.id !== nodeId);
				openModal(`<h3>加同图关联</h3>
      <div class="mfield"><label>从「${esc(from.label)}」指向</label><select id="wb-rel-target">${candidates.map((n) => `<option value="${n.id}">${esc(kindLabel(n.kind))} · ${esc(n.label)}</option>`).join("")}</select></div>
      <div class="mfield"><label>关系说明（可选）</label><input id="wb-rel-label" placeholder="例如：关联 / 前置"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-relate-save" data-id="${nodeId}">添加</button></div>`);
			}
			function saveRelate(nodeId, ext) {
				const graph = mapGraph();
				const to = $id("wb-rel-target")?.value ?? "";
				const label = $id("wb-rel-label")?.value.trim() ?? "";
				if (to === "") return;
				const key = ext ? to : to;
				if (graph.edges.some((e) => e.kind === "relate" && e.from === nodeId && e.to === key)) {
					toast("这条关联已存在");
					return;
				}
				graph.edges.push({
					from: nodeId,
					to: key,
					kind: "relate",
					label: label.slice(0, 24) || void 0
				});
				commitMapGraph(graph);
				closeModal();
				renderContent();
				toast(ext ? "已加跨图引用" : "已加同图关联");
			}
			function mapMenuItems(node) {
				if (node === void 0) return [
					{
						label: "新增功能",
						act: "product-node-new",
						kind: "feature",
						icon: "plus"
					},
					{
						label: "新增需求",
						act: "product-node-new",
						kind: "requirement",
						icon: "plus"
					},
					{
						label: "存档版本",
						act: "pm-version-archive",
						icon: "layers"
					},
					{
						label: "版本对比",
						act: "pm-version-diff",
						icon: "tag"
					}
				];
				const items = [{
					label: "添加子节点",
					act: "product-node-child",
					icon: "corner",
					key: "Tab"
				}];
				if (node.kind !== "root") items.push({
					label: "添加同级",
					act: "product-node-sibling",
					icon: "plus",
					key: "Enter"
				});
				items.push({
					label: "编辑属性",
					act: "product-node-edit",
					icon: "edit",
					key: "F2"
				});
				if (node.kind !== "root") {
					for (const k of PRODUCT_KIND_OPTIONS) if (k !== node.kind) items.push({
						label: `改为${kindLabel(k)}`,
						act: "pm-node-kind",
						icon: "tag",
						id: node.id,
						kind: k
					});
				}
				items.push({
					label: "加同图关联",
					act: "pm-node-relate",
					icon: "arrowR",
					id: node.id
				});
				items.push({
					label: "加跨图引用",
					act: "pm-node-relate-ext",
					icon: "arrowR",
					id: node.id
				});
				items.push({
					label: node.collapsed === true ? "展开子树" : "折叠子树",
					act: "pm-toggle-fold",
					icon: "chevD",
					id: node.id
				});
				if (node.kind !== "root") items.push({
					label: "删除节点",
					act: "product-node-delete",
					icon: "trash",
					key: "Del",
					danger: true
				});
				return items;
			}
			function closeContextMenu() {
				const menu = $id("wb-ctxmenu");
				if (menu === null) return;
				menu.classList.remove("open");
				menu.innerHTML = "";
				ctxMenuOpen = false;
			}
			function openContextMenu(nodeId, x, y) {
				const menu = $id("wb-ctxmenu");
				if (menu === null) return;
				const node = nodeId === null ? void 0 : productNodeById(void 0, nodeId);
				const items = mapMenuItems(node);
				menu.innerHTML = `<div class="ctx-head">${node === void 0 ? "画布" : `${kindLabel(node.kind)} · ${esc(node.label.slice(0, 24))}`}</div>${items.map((item) => `<button class="ctx-item${item.danger === true ? " danger" : ""}" data-act="${item.act}"${item.id === void 0 ? "" : ` data-id="${item.id}"`}${item.kind === void 0 ? "" : ` data-kind="${item.kind}"`}>${ic(item.icon ?? "plus", 13)}<span>${item.label}</span>${item.key === void 0 ? "" : `<kbd>${item.key}</kbd>`}</button>`).join("")}`;
				menu.classList.add("open");
				menu.querySelectorAll(".ctx-item").forEach((item) => {
					item.addEventListener("click", () => {
						window.setTimeout(closeContextMenu, 0);
					});
				});
				const width = 214;
				const height = 30 * (items.length + 1) + 14;
				menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`;
				menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y))}px`;
				ctxMenuOpen = true;
			}
			function onContextMenu(event) {
				const target = event.target;
				if (target === null) return;
				if (ui.view !== "product" || productTab !== "map" || productMapPreview !== null) return;
				const nodeEl = target.closest("#pm-plot [data-nodeid]");
				const canvas = target.closest("#pm-plot");
				if (nodeEl === null && canvas === null) return;
				event.preventDefault();
				const nodeId = nodeEl === null ? "" : productGraphIdOf(nodeEl.getAttribute("data-nodeid") ?? "");
				if (nodeId !== "") productNodeSelected = nodeId;
				openContextMenu(nodeId === "" ? null : nodeId, event.clientX, event.clientY);
			}
			function productOutline(_product) {
				return productGraphToMarkdown(mapGraph());
			}
			function exportMindmapOutline() {
				const product = productOf(productSelected);
				if (!product) return;
				const text = productOutline(product);
				try {
					const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = `${product.name}-导图大纲.md`;
					a.click();
					URL.revokeObjectURL(url);
					toast("大纲已导出");
				} catch {
					navigator.clipboard.writeText(text).then(() => toast("已复制大纲到剪贴板")).catch(() => toast("导出失败"));
				}
			}
			function importMindmapOutline() {
				const map = activeMap();
				if (map === void 0) {
					toast("先选择导图");
					return;
				}
				openModal(`<h3>导入大纲（替换当前导图）</h3>
      <div class="mfield"><label>粘贴 Markdown 大纲（缩进或 - 层级；（模块）（业务）（需求）标记类型）</label><textarea id="wb-pm-outline" rows="10" placeholder="- 登录（模块）&#10;  - 手机验证码登录&#10;  - 一键登录（需求）"></textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">导入会<b>替换</b>「${esc(map.name)}」当前草稿；导入前会自动存档当前版本，可随时回滚。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-import-run">导入</button></div>`);
			}
			async function runMindmapImport() {
				const map = activeMap();
				if (!map) return;
				const { graph, issues } = parseOutlineToProductGraph($id("wb-pm-outline")?.value ?? "", map.name);
				if (graph.nodes.length <= 1) {
					toast("没有解析到大纲内容");
					return;
				}
				if (issues.length > 0) console.warn("[dsh-workbench] 大纲解析提示：", issues);
				try {
					await fetch(`${API}/products/maps/versions`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ version: {
							mapId: map.id,
							label: "导入前快照",
							source: "manual",
							summary: "导入大纲前自动存档"
						} })
					});
					const res = await fetch(`${API}/products/maps/versions`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ version: {
							mapId: map.id,
							graph,
							source: "outline",
							label: "大纲导入",
							summary: `导入 ${graph.nodes.length - 1} 个节点`
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					closeModal();
					await loadProductMaps();
					renderContent();
					toast(`已导入 ${graph.nodes.length - 1} 个节点`);
				} catch (cause) {
					toast(`导入失败：${String(cause.message ?? cause)}`);
				}
			}
			function openMapEditor(id) {
				if (productOf(productSelected) === void 0) {
					toast("先选择产品");
					return;
				}
				if (!productMapsReady) {
					toast("多导图需要宿主更新，请重启 DSH");
					return;
				}
				const map = id === void 0 ? void 0 : productMaps.find((item) => item.id === id);
				if (map !== void 0) {
					openModal(`<h3>编辑导图</h3>
        <div class="mfield"><label>名称</label><input id="wb-map-name" value="${esc(map.name)}"></div>
        <div class="mfield"><label>说明（可选）</label><input id="wb-map-desc" value="${esc(map.description)}"></div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-map-save" data-id="${map.id}">保存</button></div>`);
					return;
				}
				openModal(`<h3>新建产品导图</h3>
      <div class="mfield"><label>来源</label><select id="wb-map-source">
        <option value="blank">自建空白（画布直接编辑）</option>
        <option value="outline">导入 Markdown 大纲</option>
        <option value="idea">从灵感选择（整图 / 分支）</option>
      </select></div>
      <div class="mfield"><label>名称</label><input id="wb-map-name" placeholder="例如：收银主链路 / 移动端 / V2 改版"></div>
      <div class="mfield"><label>说明（可选）</label><input id="wb-map-desc" placeholder="这张导图负责的范围（多张导图互为补充）"></div>
      <div class="mfield" id="wb-map-outline-field"><label>粘贴 Markdown 大纲</label><textarea id="wb-map-outline" rows="8" placeholder="- 登录（模块）&#10;  - 手机验证码登录"></textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">每张导图有独立版本序列；文件镜像在 <code>.dsh-workbench/products/&lt;id&gt;/maps/&lt;mapId&gt;.json</code>。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-map-save" data-id="">创建</button></div>`);
				const sel = $id("wb-map-source");
				const syncOutlineField = () => {
					const field = $id("wb-map-outline-field");
					if (field instanceof HTMLElement) field.style.display = sel?.value === "outline" ? "" : "none";
				};
				sel?.addEventListener("change", syncOutlineField);
				syncOutlineField();
			}
			async function saveMapFromModal(id) {
				const product = productOf(productSelected);
				if (product === void 0) return;
				const name = $id("wb-map-name")?.value.trim() ?? "";
				const description = $id("wb-map-desc")?.value.trim() ?? "";
				const source = $id("wb-map-source")?.value ?? "blank";
				if (id === "" && source === "idea") {
					closeModal();
					openIdeaImport(name);
					return;
				}
				if (name === "") {
					toast("先填名称");
					return;
				}
				try {
					let graph;
					let archiveSource = "";
					let archiveLabel = "";
					if (source === "outline") {
						const parsed = parseOutlineToProductGraph($id("wb-map-outline")?.value ?? "", name);
						if (parsed.graph.nodes.length <= 1) {
							toast("没有解析到大纲内容");
							return;
						}
						graph = parsed.graph;
						archiveSource = "outline";
						archiveLabel = "大纲导入";
					} else if (id === "") graph = emptyProductGraph(name);
					const res = await fetch(`${API}/products/maps`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ map: {
							id: id || void 0,
							productId: product.id,
							name,
							description,
							graph,
							source: archiveSource || void 0
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const map = (await res.json()).map;
					closeModal();
					await loadProductMaps();
					if (map !== void 0 && id === "") {
						productMapSelected = map.id;
						if (archiveSource !== "") {
							await fetch(`${API}/products/maps/versions`, {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ version: {
									mapId: map.id,
									graph: map.graph,
									source: archiveSource,
									label: archiveLabel,
									summary: `导入 ${map.graph.nodes.length - 1} 个节点`
								} })
							});
							await loadProductMaps();
						}
					}
					productMapScopeAll = false;
					await loadMapVersions();
					toast(id === "" ? "已新建导图" : "已保存导图");
					renderContent();
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteMapById(id) {
				const map = productMaps.find((item) => item.id === id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除导图「${map?.name ?? id}」及其版本历史？
该导图下的模块 / 笔记 / Demo 不会被删除，会失去导图归属；其他导图指向它的跨图引用会自动清理。`) : true)) return;
				try {
					const res = await fetch(`${API}/products/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) {
						const data = await res.json().catch(() => ({}));
						throw new Error(data.error ?? `HTTP ${res.status}`);
					}
					await loadProductMaps();
					productNodeSelected = null;
					productMapPreview = null;
					productPicked = productDefaultPicked(productOf(productSelected));
					await loadMapVersions();
					toast("已删除导图");
					renderContent();
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function selectMap(id) {
				if (id === productMapSelected) return;
				productMapSelected = id;
				productMapScopeAll = false;
				productNodeSelected = null;
				productMapPreview = null;
				productPicked = productDefaultPicked(productOf(productSelected));
				loadMapVersions().then(() => renderContent());
			}
			async function openIdeaImport(presetName = "") {
				try {
					const res = await fetch(`${API}/ideas`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					const ideas = Array.isArray(data.ideas) ? data.ideas : [];
					if (ideas.length === 0) {
						toast("还没有灵感：先在「灵感」里发散一版");
						return;
					}
					openModal(`<h3>从灵感导入 · 选择灵感</h3>
        <div class="mfield"><label>灵感</label><select id="wb-idea-pick">${ideas.map((idea) => `<option value="${idea.id}">${esc(idea.title)}${idea.status ? `（${esc(idea.status)}）` : ""}</option>`).join("")}</select></div>
        <div class="mfield"><label>导图名称（默认同灵感）</label><input id="wb-idea-map-name" value="${esc(presetName || ideas[0]?.title || "")}"></div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="idea-import-next">下一步：选版本</button></div>`);
					$id("wb-idea-pick")?.addEventListener("change", (e) => {
						const input = $id("wb-idea-map-name");
						const found = ideas.find((i) => i.id === e.currentTarget.value);
						if (input instanceof HTMLInputElement && found) input.value = found.title ?? "";
					});
				} catch (cause) {
					toast(`灵感读取失败：${String(cause.message ?? cause)}`);
				}
			}
			async function openIdeaVersionPick() {
				const ideaId = $id("wb-idea-pick")?.value ?? "";
				const name = $id("wb-idea-map-name")?.value.trim() ?? "";
				if (ideaId === "") return;
				try {
					const res = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					const versions = Array.isArray(data.versions) ? data.versions : [];
					if (versions.length === 0) {
						toast("该灵感还没有版本（先生成或存档一版）");
						return;
					}
					openModal(`<h3>从灵感导入 · 选择版本</h3>
        <div class="mfield"><label>版本</label><select id="wb-idea-version">${versions.map((v) => `<option value="${v.id}">v${v.seq} · ${esc(v.label)}（${v.nodeCount ?? 0} 节点 · ${(v.createdAt ?? "").slice(5, 16)}）</option>`).join("")}</select></div>
        <div class="mfield"><label>导入范围</label><select id="wb-idea-scope"><option value="all">整张灵感图</option><option value="branch">某个方向的子树</option></select></div>
        <div class="mfield" id="wb-idea-branch-field"><label>分支起点</label><select id="wb-idea-branch"></select></div>
        <div class="mfield"><label>方向节点默认层级</label><select id="wb-idea-kind"><option value="module">模块（module）</option><option value="business">业务（business）</option></select></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">映射：方向→模块/业务、点子→功能、问题→需求（待定）、风险→需求（带「风险」标签）；角度变成 angle:* 标签保留溯源。</div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="idea-import-run" data-idea="${esc(ideaId)}" data-name="${esc(name)}">导入并创建导图</button></div>`);
					const versionSel = $id("wb-idea-version");
					const scopeSel = $id("wb-idea-scope");
					const branchField = $id("wb-idea-branch-field");
					const syncScope = () => {
						if (branchField instanceof HTMLElement) branchField.style.display = scopeSel?.value === "branch" ? "" : "none";
					};
					scopeSel?.addEventListener("change", syncScope);
					syncScope();
					const loadBranches = async () => {
						const branchSel = $id("wb-idea-branch");
						if (branchSel === null) return;
						branchSel.innerHTML = "<option value=\"\">加载中…</option>";
						try {
							const vRes = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}/versions/${encodeURIComponent(versionSel?.value ?? "")}`);
							if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`);
							const nodes = ((await vRes.json()).version?.graph)?.nodes ?? [];
							branchSel.innerHTML = nodes.map((n) => `<option value="${esc(n.id)}">${"　".repeat(Math.max(0, nodes.findIndex((x) => x.id === n.id) === 0 ? 0 : 1))}${esc(n.type)} · ${esc(n.label)}</option>`).join("");
						} catch {
							branchSel.innerHTML = "<option value=\"\">读取失败</option>";
						}
					};
					versionSel?.addEventListener("change", () => {
						loadBranches();
					});
					loadBranches();
				} catch (cause) {
					toast(`版本读取失败：${String(cause.message ?? cause)}`);
				}
			}
			async function runIdeaImport(ideaId, name) {
				const product = productOf(productSelected);
				if (!product) return;
				const versionId = $id("wb-idea-version")?.value ?? "";
				const scope = $id("wb-idea-scope")?.value ?? "all";
				const branch = $id("wb-idea-branch")?.value ?? "";
				const defaultKind = $id("wb-idea-kind")?.value ?? "module";
				try {
					const res = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}/versions/${encodeURIComponent(versionId)}`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					const ideaGraph = data.version?.graph;
					if (!ideaGraph || !Array.isArray(ideaGraph.nodes)) throw new Error("灵感版本图为空");
					const sourceRef = `${ideaId}@v${data.version?.seq ?? ""}`;
					const title = name || product.name;
					const converted = productGraphFromIdea(ideaGraph, {
						title,
						branchNodeId: scope === "branch" ? branch : "",
						defaultKind
					});
					if (converted.issues.length > 0) console.warn("[dsh-workbench] 灵感导入规范化提示：", converted.issues);
					const graph = converted.graph;
					if (graph.nodes.length <= 1) throw new Error("灵感图没有可导入的节点（该版本可能为空）");
					const mapRes = await fetch(`${API}/products/maps`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ map: {
							productId: product.id,
							name: title,
							description: `导入自灵感 ${sourceRef}`,
							graph,
							source: "idea",
							sourceRef
						} })
					});
					if (!mapRes.ok) throw new Error(`HTTP ${mapRes.status}`);
					const map = (await mapRes.json()).map;
					if (map !== void 0) {
						await fetch(`${API}/products/maps/versions`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ version: {
								mapId: map.id,
								graph: map.graph,
								source: "idea",
								sourceRef,
								label: "灵感导入",
								summary: `${scope === "branch" ? "分支" : "整图"}导入 ${map.graph.nodes.length} 节点`
							} })
						});
						productMapSelected = map.id;
					}
					closeModal();
					await loadProductMaps();
					await loadMapVersions();
					renderContent();
					toast("已从灵感创建导图");
				} catch (cause) {
					toast(`导入失败：${String(cause.message ?? cause)}`);
				}
			}
			async function archiveMapVersion() {
				const map = activeMap();
				if (!map) {
					toast("先选择导图");
					return;
				}
				try {
					const res = await fetch(`${API}/products/maps/versions`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ version: {
							mapId: map.id,
							graph: map.graph,
							source: "manual",
							label: `v${(productMapVersions[0]?.seq ?? 0) + 1} 存档`,
							summary: `手动存档 · ${map.graph.nodes.length} 节点`
						} })
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					await loadProductMaps();
					renderContent();
					toast("已存档版本");
				} catch (cause) {
					toast(`存档失败：${String(cause.message ?? cause)}`);
				}
			}
			async function previewMapVersion(id) {
				try {
					const res = await fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(id)}`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					productMapPreview = (await res.json()).version ?? null;
					renderContent();
				} catch (cause) {
					toast(`预览失败：${String(cause.message ?? cause)}`);
				}
			}
			async function rollbackMapVersion(id) {
				const version = productMapVersions.find((v) => v.id === id);
				if (!(typeof window.confirm === "function" ? window.confirm(`回滚到 v${version?.seq ?? ""}？当前草稿会被该版本覆盖（历史保留）。`) : true)) return;
				try {
					const res = await fetch(`${API}/products/maps/versions/rollback`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							mapId: productMapSelected,
							versionId: id
						})
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					productMapPreview = null;
					await loadProductMaps();
					await loadMapVersions();
					renderContent();
					toast(`已回滚到 v${version?.seq ?? ""}`);
				} catch (cause) {
					toast(`回滚失败：${String(cause.message ?? cause)}`);
				}
			}
			async function removeMapVersion(id) {
				const version = productMapVersions.find((v) => v.id === id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除版本 v${version?.seq ?? ""}？该版本图不可恢复（草稿不受影响）。`) : true)) return;
				try {
					const res = await fetch(`${API}/products/maps/versions/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) {
						const data = await res.json().catch(() => ({}));
						throw new Error(data.error ?? `HTTP ${res.status}`);
					}
					if (productMapPreview?.id === id) productMapPreview = null;
					await loadMapVersions();
					renderContent();
					toast("版本已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			async function openMapVersionDiff() {
				if (productMapVersions.length < 2) {
					toast("至少需要两个版本才能对比");
					return;
				}
				openModal(`<h3>版本对比</h3>
      <div class="mfield"><label>版本 A（旧）</label><select id="wb-diff-a">${productMapVersions.map((v) => `<option value="${v.id}">v${v.seq} · ${esc(v.label)}</option>`).join("")}</select></div>
      <div class="mfield"><label>版本 B（新）</label><select id="wb-diff-b">${productMapVersions.map((v, i) => `<option value="${v.id}" ${i === 1 ? "selected" : ""}>v${v.seq} · ${esc(v.label)}</option>`).join("")}</select></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-version-diff-run">对比</button></div>`);
			}
			async function runMapVersionDiff() {
				const aId = $id("wb-diff-a")?.value ?? "";
				const bId = $id("wb-diff-b")?.value ?? "";
				try {
					const [aRes, bRes] = await Promise.all([fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(aId)}`), fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(bId)}`)]);
					if (!aRes.ok || !bRes.ok) throw new Error(`HTTP ${aRes.status}/${bRes.status}`);
					const a = (await aRes.json()).version;
					const b = (await bRes.json()).version;
					if (!a?.graph || !b?.graph) throw new Error("版本图为空");
					const diff = diffProductGraphs(a.graph, b.graph);
					const entry = (list) => list.length === 0 ? "<li>无</li>" : list.slice(0, 40).map((n) => `<li>${esc(n.label)}</li>`).join("");
					openModal(`<h3>版本对比：v${a.seq} → v${b.seq}</h3>
        <div class="mfield"><b>新增 ${diff.added.length} 节点</b><ul class="diff-list">${entry(diff.added)}</ul></div>
        <div class="mfield"><b>删除 ${diff.removed.length} 节点</b><ul class="diff-list">${entry(diff.removed)}</ul></div>
        <div class="mfield"><b>改名 ${diff.changed.length} 节点</b><ul class="diff-list">${diff.changed.length === 0 ? "<li>无</li>" : diff.changed.slice(0, 40).map((n) => `<li>${esc(n.before)} → ${esc(n.after)}</li>`).join("")}</ul></div>
        <div class="mfield">边：+${diff.addedEdges} / −${diff.removedEdges}</div>
        <div class="modal-foot"><button class="btn solid" data-act="close-modal">关闭</button></div>`);
				} catch (cause) {
					toast(`对比失败：${String(cause.message ?? cause)}`);
				}
			}
			function openProductEdit(id, presetPath) {
				const product = productOf(id);
				const workspaces = bugWorkspaceItems();
				const current = product?.workspacePath ?? (presetPath && presetPath !== "" ? presetPath : workspaces[0]?.path ?? "");
				openModal(`<h3>${product ? "编辑项目 / 产品" : "新建项目 / 产品"}</h3>
      <div class="mfield"><label>项目 / 产品名称</label><input id="wb-prod-name" value="${esc(product?.name ?? "")}" placeholder="例如：时序工作台 / 安捷邻"></div>
      <div class="mfield"><label>简介</label><textarea id="wb-prod-desc" rows="3" placeholder="目标用户、核心价值">${esc(product?.description ?? "")}</textarea></div>
      <div class="mfield"><label>关联 DSH 工作区</label>${workspaces.length > 0 ? `<select id="wb-prod-ws">${workspaces.map((ws) => `<option value="${esc(ws.path)}" ${ws.path === current ? "selected" : ""}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join("")}</select>` : "<div class=\"muted\" style=\"font-size:10.5px\">未读取到工作区，可直接填路径。</div>"}</div>
      <div class="mfield"><label>工作区路径</label><input id="wb-prod-path" value="${esc(current)}" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">创建后会自动建立「产品：名称」笔记本并关联同一工作区；导图、笔记文件、Demo 都会写到该目录。</div>
      <div class="modal-foot">${product ? `<button class="btn" data-act="product-delete" data-id="${product.id}">${ic("trash", 12)}删除产品</button>` : ""}<button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-save" data-id="${product?.id ?? ""}">${product ? "保存" : "创建产品"}</button></div>`);
				$id("wb-prod-ws")?.addEventListener("change", (e) => {
					const v = e.currentTarget.value;
					const p = $id("wb-prod-path");
					if (p) p.value = v;
				});
			}
			async function saveProduct(id) {
				const name = $id("wb-prod-name")?.value.trim() ?? "";
				if (name === "") {
					$id("wb-prod-name")?.focus();
					return;
				}
				const workspacePath = $id("wb-prod-path")?.value.trim() ?? "";
				try {
					const res = await fetch(`${API}/products`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ product: {
							id: id || void 0,
							name,
							description: $id("wb-prod-desc")?.value ?? "",
							workspacePath
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.product) throw new Error(data.message ?? `HTTP ${res.status}`);
					const index = products.findIndex((p) => p.id === data.product.id);
					if (index >= 0) products[index] = data.product;
					else products.unshift(data.product);
					productSelected = data.product.id;
					productPicked = productDefaultPicked(data.product);
					productNodeSelected = null;
					closeModal();
					await loadProducts(true);
					renderContent();
					toast("产品已保存");
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			async function generateProductModules() {
				const product = productOf(productSelected);
				if (!product?.workspacePath) {
					toast("产品未关联工作区");
					return;
				}
				if (!window.confirm("AI 将拆分模块/业务并生成详细设计笔记，可能消耗额度。继续？")) return;
				const prompt = productPrompt(product, "modules", "all");
				try {
					await navigator.clipboard.writeText(prompt);
				} catch {}
				toast("正在新建设计会话…");
				try {
					await queueProductPrompt(prompt);
				} catch (cause) {
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			async function generateProductNotes() {
				const product = productOf(productSelected);
				if (!product?.workspacePath) {
					toast("产品未关联工作区");
					return;
				}
				const featureNodes = productFeatureNodes(product);
				if (featureNodes.length === 0) {
					toast("先在导图中添加功能/需求");
					return;
				}
				const picked = productSelectedFeatures(product);
				const scope = picked.length > 0 ? "feature" : "all";
				const covered = scope === "feature" ? picked.length : featureNodes.length;
				if (!(typeof window.confirm === "function" ? window.confirm(`AI 将为${scope === "feature" ? `勾选的 ${covered} 个` : `全部 ${covered} 个`}功能/需求生成设计笔记，可能消耗额度。继续？`) : true)) return;
				const prompt = productPrompt(product, "notes", scope);
				try {
					await navigator.clipboard.writeText(prompt);
				} catch {}
				toast("正在新建产品设计会话…");
				try {
					await queueProductPrompt(prompt);
				} catch (cause) {
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			function productDemoCss(style) {
				const base = `*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65;background:var(--bg);color:var(--text)}a{color:inherit}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr}.top{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:3}.brand{font-weight:800;font-size:18px;letter-spacing:-.3px}.badge{font-size:10px;border:1px solid var(--line);border-radius:99px;padding:2px 8px;color:var(--muted)}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:0}.nav{border-right:1px solid var(--line);padding:18px 14px;position:sticky;top:57px;height:calc(100vh - 57px);overflow:auto;background:var(--surface)}.nav b{display:block;font-size:10px;letter-spacing:.12em;color:var(--muted);margin-bottom:9px;text-transform:uppercase}.nav a{display:block;padding:7px 9px;border-radius:7px;text-decoration:none;font-size:13px;color:var(--muted);margin-bottom:2px}.nav a:hover{background:var(--hover);color:var(--text)}.main{padding:42px 48px 72px;max-width:1000px;width:100%;margin:0 auto}.hero{padding:20px 0 26px;border-bottom:1px solid var(--line);margin-bottom:26px}.hero .kicker{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}.hero h1{font-size:34px;line-height:1.2;margin:8px 0 7px;letter-spacing:-.6px}.hero p{color:var(--muted);font-size:14px;margin:0;max-width:680px}.feature{padding:24px 0 30px;border-bottom:1px solid var(--line)}.feature:last-child{border-bottom:0}.feature h2{font-size:23px;margin:0 0 12px;letter-spacing:-.3px}.feature .tag{font-size:10px;color:var(--accent);font-weight:700;letter-spacing:.1em;text-transform:uppercase}.doc h1,.doc h2,.doc h3{margin:16px 0 6px;line-height:1.3}.doc h1{font-size:20px}.doc h2{font-size:16px}.doc h3{font-size:14px}.doc p,.doc li{font-size:13.5px;color:var(--muted)}.doc ul,.doc ol{padding-left:20px}.doc blockquote{border-left:3px solid var(--accent);margin:10px 0;padding:6px 12px;background:var(--hover);color:var(--muted)}.doc code{background:var(--hover);padding:1px 4px;border-radius:4px;font-size:12px}.doc pre{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow:auto}.doc a{color:var(--accent)}.doc table{border-collapse:collapse;width:100%}.doc td,.doc th{border:1px solid var(--line);padding:5px 7px;font-size:12px}.empty{border:1px dashed var(--line);border-radius:10px;padding:16px;color:var(--muted);font-size:13px}.foot{padding:16px 28px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;display:flex;justify-content:space-between}.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none;font-size:12px;font-weight:600}`;
				const themes = {
					clean: ":root{--bg:#f7f9fc;--surface:#fff;--text:#111827;--muted:#5b6577;--line:#e4e9f2;--hover:#eef4ff;--accent:#2563eb}.hero h1{font-family:inherit}",
					editorial: ":root{--bg:#f6f1e7;--surface:#fbf7ef;--text:#1f1b16;--muted:#6b6156;--line:#ded4c4;--hover:#efe6d7;--accent:#c2410c}body{font-family:Georgia,\"Songti SC\",serif}.brand,.hero h1,.feature h2{font-family:Georgia,\"Songti SC\",serif}.hero h1{font-size:38px}.nav{background:transparent}",
					neo: ":root{--bg:#e8ebf0;--surface:#eef1f6;--text:#2b3340;--muted:#6a7485;--line:#d5dbe5;--hover:#e0e6ef;--accent:#4f6bed}body{background:linear-gradient(135deg,#edf0f5,#dfe4ec)}.top,.nav,.hero,.feature,.doc pre{box-shadow:6px 6px 14px #c9d0db,-6px -6px 14px #fff}.top,.nav,.feature{background:transparent;border-color:transparent}.btn{box-shadow:3px 3px 8px #c3cbd7,-3px -3px 8px #fff}",
					glass: ":root{--bg:#0c1222;--surface:rgba(255,255,255,.06);--text:#eef4ff;--muted:#a8b6d4;--line:rgba(255,255,255,.14);--hover:rgba(255,255,255,.1);--accent:#7aa2ff}body{background:radial-gradient(1200px 700px at 15% 0%,#263a6b 0,transparent 60%),radial-gradient(900px 600px at 100% 30%,#4a2a67 0,transparent 55%),#0c1222}.top,.nav{background:rgba(12,18,34,.55);backdrop-filter:blur(14px)}.feature{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:14px;padding:22px;margin:14px 0;backdrop-filter:blur(8px)}.doc p,.doc li{color:var(--muted)}.doc blockquote{background:rgba(255,255,255,.05)}",
					dashboard: ":root{--bg:#0f172a;--surface:#16233a;--text:#e2e8f0;--muted:#94a3b8;--line:#24344f;--hover:#1d2c47;--accent:#38bdf8}body{background:radial-gradient(1000px 500px at 80% -10%,#1e3a5f 0,transparent 55%),#0f172a}.feature{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin:12px 0}.hero .kicker{color:#a78bfa}.badge{border-color:#334155}.btn{background:linear-gradient(135deg,#38bdf8,#6366f1)}.doc pre{background:#0b1220}.doc code{background:#1e293b}",
					bento: ":root{--bg:#f5f5f4;--surface:#fff;--text:#111827;--muted:#57534e;--line:#e7e5e4;--hover:#fafaf9;--accent:#2563eb}.main{max-width:1100px}.hero h1{font-size:44px;letter-spacing:-1.5px}.feature{border:0;border-radius:22px;padding:26px;margin:14px 0;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}.feature:nth-child(3n){background:#fef3c7}.feature:nth-child(3n+1){background:#dbeafe}.feature:nth-child(3n+2){background:#dcfce7}.feature h2{font-size:26px}.btn{border-radius:999px;padding:10px 18px}",
					tech: ":root{--bg:#0a0f1a;--surface:#111827;--text:#d1fae5;--muted:#6b7f99;--line:#1f2c42;--hover:#152036;--accent:#22d3ee}body{background-image:linear-gradient(rgba(34,211,238,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.05) 1px,transparent 1px);background-size:28px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.hero h1{font-family:ui-monospace,monospace}.hero .kicker{color:#22d3ee}.brand{letter-spacing:.06em}.badge{border-color:#22d3ee55;color:#22d3ee}.btn{background:#22d3ee;color:#04222b;border-radius:4px}.doc code{background:#0f2030;color:#7dd3fc}",
					aurora: ":root{--bg:#17123a;--surface:rgba(255,255,255,.1);--text:#fff;--muted:#c7c3ee;--line:rgba(255,255,255,.18);--hover:rgba(255,255,255,.14);--accent:#f472b6}body{background:linear-gradient(135deg,#667eea 0%,#764ba2 45%,#f093fb 100%);background-attachment:fixed}.top,.nav{background:rgba(23,18,58,.35);backdrop-filter:blur(16px)}.feature{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:22px;margin:14px 0;backdrop-filter:blur(10px)}.hero h1{font-size:40px}.btn{background:linear-gradient(135deg,#f472b6,#a78bfa);border-radius:999px}.doc blockquote{background:rgba(255,255,255,.1)}",
					cream: ":root{--bg:#faf6f1;--surface:#fff;--text:#3d3128;--muted:#8d7b6c;--line:#efe5da;--hover:#f5ebe1;--accent:#e07a5f}body{background:linear-gradient(180deg,#fdf8f3,#f7ede4)}.hero h1{font-size:36px;font-weight:800}.feature{background:#fff;border-radius:18px;padding:22px;margin:13px 0;box-shadow:0 8px 24px rgba(93,64,42,.06);border:0}.feature h2{font-weight:700}.btn{background:#e07a5f;border-radius:999px;box-shadow:0 6px 16px rgba(224,122,95,.35)}.top,.nav{background:rgba(255,255,255,.7);border-color:#efe5da}",
					clay: ":root{--bg:#f0f4ff;--surface:#fff;--text:#1d2b53;--muted:#5b6b9c;--line:#dfe7ff;--hover:#e7edff;--accent:#4cc9f0}body{background:linear-gradient(160deg,#e8f0fe,#fde8f0)}.feature{border:0;border-radius:24px;padding:24px;margin:13px 0;background:#fff;box-shadow:8px 8px 20px #c9d4ee,-8px -8px 20px #fff}.feature:nth-child(2n){background:#ffd166}.feature:nth-child(3n){background:#06d6a0;color:#0b3d2e}.btn{border-radius:16px;box-shadow:4px 4px 10px rgba(76,201,240,.4);background:#4cc9f0;color:#083344}.hero h1{font-size:38px}",
					brutal: ":root{--bg:#fff;--surface:#fff;--text:#000;--muted:#333;--line:#000;--hover:#ffe066;--accent:#ff6b6b}body{background:#fff;font-family:\"Arial Black\",Arial,sans-serif}.top{border-bottom:3px solid #000;background:#ffe066}.nav{border-right:3px solid #000;background:#74b9ff}.feature{border:3px solid #000;border-radius:0;padding:22px;margin:14px 0;box-shadow:6px 6px 0 #000;background:#fff}.feature:nth-child(2n){background:#ff6b6b;color:#fff}.feature:nth-child(3n){background:#6bcb77}.hero h1{font-size:42px;text-transform:uppercase;letter-spacing:-1px}.btn{background:#000;color:#fff;border-radius:0;border:3px solid #000;box-shadow:4px 4px 0 #ff6b6b}.badge{border:2px solid #000;border-radius:0}",
					padflow: ":root{--bg:#f8fafc;--surface:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--hover:#f1f5f9;--accent:#0ea5e9}.layout{grid-template-columns:280px minmax(0,1fr)}.nav a{padding:12px 14px;font-size:14px;min-height:44px;display:flex;align-items:center}.btn{min-height:44px;padding:12px 18px;font-size:14px}.hero h1{font-size:36px}.feature{padding:28px 0}.top{padding:18px 32px}"
				};
				return base + (themes[style] ?? themes.clean);
			}
			function productNoteForFeature(product, feature) {
				return productNoteList(product).find((note) => note.tags.includes(feature.id) || note.title.includes(feature.label)) ?? productNoteList(product).find((note) => note.title.startsWith(feature.label));
			}
			function productDemoHtml(product, features, style, scope, kind = "page", platform = "all") {
				const sections = features.map((feature) => {
					const note = productNoteForFeature(product, feature);
					const body = note ? markdownToHtml(note.content) : `<div class="empty">还没有设计笔记；先点「设计笔记 → AI 生成设计笔记」。</div>`;
					return `<section class="feature" id="f-${feature.id}"><span class="tag">${kindLabel(feature.kind)}</span><h2>${esc(feature.label)}</h2><div class="doc">${body}</div></section>`;
				}).join("");
				const pageNav = features.map((feature, i) => `<a href="${kind === "system" ? `#p-${feature.id}` : `#f-${feature.id}`}" ${kind === "system" ? `data-page="${feature.id}" class="page-link${i === 0 ? " active" : ""}"` : ""}>${esc(feature.label)}</a>`).join("");
				const modeBadge = kind === "system" ? "产品系统" : "单页原型";
				const shell = kind === "system" ? `<div class="layout"><nav class="nav"><b>功能导航</b>${pageNav}</nav><main class="main"><div class="hero"><span class="kicker">Product System</span><h1>${esc(product.name)}</h1><p>${esc(product.description || "由产品设计笔记与灵感资料生成的可交互产品系统 Demo。")}</p></div><div class="pages">${features.map((feature, i) => {
					const note = productNoteForFeature(product, feature);
					const body = note ? markdownToHtml(note.content) : `<div class="empty">还没有设计笔记；先点「设计笔记 → AI 生成设计笔记」。</div>`;
					return `<section class="feature page${i === 0 ? " active" : ""}" id="p-${feature.id}" data-page-panel="${feature.id}"><span class="tag">${kindLabel(feature.kind)}</span><h2>${esc(feature.label)}</h2><div class="doc">${body}</div></section>`;
				}).join("")}</div></main></div>` : `<div class="layout"><nav class="nav"><b>功能导航</b>${pageNav}</nav><main class="main"><div class="hero"><span class="kicker">Product Prototype</span><h1>${esc(product.name)}</h1><p>${esc(product.description || "由产品设计笔记生成的可交互原型。")}</p></div>${sections}</main></div>`;
				const systemJs = kind === "system" ? `<script>document.querySelectorAll('.page-link').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var id=a.getAttribute('data-page');document.querySelectorAll('.page-link').forEach(function(x){x.classList.remove('active')});a.classList.add('active');document.querySelectorAll('[data-page-panel]').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-page-panel')===id)});window.scrollTo({top:0,behavior:'smooth'})})})<\/script>` : "";
				return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(product.name)} · 产品 Demo</title><style>${productDemoCss(style)}${kind === "system" ? ".pages .page{display:none}.pages .page.active{display:block}" : ""}</style></head><body><div class="shell"><header class="top"><span class="brand">${esc(product.name)}</span><span class="badge">${modeBadge} · ${esc(themeOf(style).name)}</span><span style="margin-left:auto;font-size:11px;color:var(--muted)">${platformLabel(platform)} · ${scope === "all" ? "整个产品" : "单功能预览"}</span></header>${shell}<footer class="foot"><span>由工作台产品设计生成 · ${(/* @__PURE__ */ new Date()).toLocaleString()}</span><span>${esc(style)} / ${esc(platform)}</span></footer></div>${systemJs}</body></html>`;
			}
			async function generateProductDemo(scope) {
				const product = productOf(productSelected);
				if (!product?.workspacePath) {
					toast("产品未关联工作区");
					return;
				}
				const features = scope === "all" ? productFeatureNodes(product) : productSelectedFeatures(product);
				if (features.length === 0) {
					toast(scope === "all" ? "先添加功能节点" : "先勾选功能");
					return;
				}
				const targets = scope === "all" ? [features] : features.map((f) => [f]);
				const theme = themeOf(productStyle);
				try {
					await fetch(`${API}/products/demo-progress`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ progress: {
							productId: product.id,
							step: 0,
							total: targets.length,
							status: "running",
							message: `开始渲染（${theme.name}）`
						} })
					});
					demoProgress = {
						id: `dp-${product.id}`,
						productId: product.id,
						demoId: "",
						step: 0,
						total: targets.length,
						status: "running",
						message: `开始渲染（${theme.name}）`,
						log: [],
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					};
					renderContent();
					let last;
					for (let i = 0; i < targets.length; i += 1) {
						const group = targets[i];
						const html = productDemoHtml(product, group, productStyle, scope, productDemoKind, productPlatform);
						const title = `${product.name} · ${theme.name} · ${productDemoKind === "system" ? "系统" : "单页"} · ${scope === "all" ? "整个产品" : group[0].label}`;
						const res = await fetch(`${API}/products/demo`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								productId: product.id,
								scope,
								kind: productDemoKind,
								platform: productPlatform,
								style: productStyle,
								featureId: scope === "feature" ? group[0].id : "",
								title,
								html
							})
						});
						const data = await res.json();
						if (!res.ok || !data.demo) throw new Error(data.message ?? `HTTP ${res.status}`);
						productDemos = [data.demo, ...productDemos.filter((d) => d.id !== data.demo.id)];
						last = data.demo;
						const step = i + 1;
						await fetch(`${API}/products/demo-progress`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ progress: {
								productId: product.id,
								demoId: data.demo.id,
								step,
								total: targets.length,
								status: step === targets.length ? "done" : "running",
								message: `已渲染 ${step}/${targets.length}：${title}`
							} })
						});
					}
					await loadDemoProgress(product.id);
					if (last) productDemoSelected = last.id;
					renderContent();
					toast(`已生成 ${targets.length} 个 Demo（${theme.name} · ${productDemoKind === "system" ? "产品系统" : "单页"} · ${platformLabel(productPlatform)}）`);
				} catch (cause) {
					try {
						await fetch(`${API}/products/demo-progress`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ progress: {
								productId: product.id,
								step: 0,
								total: targets.length,
								status: "failed",
								message: String(cause.message ?? cause)
							} })
						});
						await loadDemoProgress(product.id);
					} catch {}
					renderContent();
					toast(`Demo 生成失败：${String(cause.message ?? cause)}`);
				}
			}
			async function loadDemoProgress(productId) {
				try {
					const before = demoProgress ? `${demoProgress.step}/${demoProgress.total}/${demoProgress.status}/${demoProgress.message}/${demoProgress.log.length}` : "";
					const res = await fetch(`${API}/products/demo-progress?productId=${encodeURIComponent(productId)}`);
					if (!res.ok) return;
					demoProgress = (await res.json()).progress ?? null;
					if ((demoProgress ? `${demoProgress.step}/${demoProgress.total}/${demoProgress.status}/${demoProgress.message}/${demoProgress.log.length}` : "") !== before && ui.view === "product" && ($id("wb-modal")?.innerHTML ?? "") === "") renderContent();
				} catch {}
			}
			async function generateDemoViaAI() {
				const product = productOf(productSelected);
				if (!product?.workspacePath) {
					toast("产品未关联工作区");
					return;
				}
				const picked = productSelectedFeatures(product);
				const scope = productDemoKind === "system" || picked.length === 0 ? "all" : "feature";
				if ((scope === "all" ? productFeatureNodes(product) : picked).length === 0) {
					toast("先添加功能节点或勾选功能");
					return;
				}
				if (!(typeof window.confirm === "function" ? window.confirm(`AI 深度生成${productDemoKind === "system" ? "产品系统" : "单页"} Demo（${themeOf(productStyle).name} · ${platformLabel(productPlatform)}）？\n将在工作区新建会话，结合设计笔记与灵感资料生成，并实时回报进度。`) : true)) return;
				const prompt = productPrompt(product, "demo", scope, {
					kind: productDemoKind,
					platform: productPlatform
				});
				try {
					try {
						await fetch(`${API}/products/demo-progress`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ progress: {
								productId: product.id,
								step: 0,
								total: 4,
								status: "running",
								message: "已提交 AI 会话，等待开始生成…"
							} })
						});
						await loadDemoProgress(product.id);
					} catch {}
					await queueProductPrompt(prompt);
					toast("已新建 Demo 生成会话，回到 Demo 页可看进度");
				} catch (cause) {
					try {
						await fetch(`${API}/products/demo-progress`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ progress: {
								productId: product.id,
								step: 0,
								total: 4,
								status: "failed",
								message: `提交失败：${String(cause.message ?? cause)}`
							} })
						});
						await loadDemoProgress(product.id);
					} catch {}
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteProductDemo(id) {
				if (!(typeof window.confirm === "function" ? window.confirm("删除这个 Demo？工作区里的 HTML 文件会一并删除。") : true)) return;
				try {
					const res = await fetch(`${API}/products/demo/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					productDemos = productDemos.filter((d) => d.id !== id);
					if (productDemoSelected === id) productDemoSelected = "";
					renderContent();
					toast("Demo 已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function openModuleDetail(id) {
				const mod = productModules.find((m) => m.id === id);
				if (!mod) return;
				const note = mod.noteId ? notes.find((n) => n.id === mod.noteId) : void 0;
				const kindName = mod.kind === "module" ? "模块" : mod.kind === "business" ? "业务" : mod.kind === "feature" ? "功能" : "需求";
				openModal(`<h3>${esc(mod.name)}</h3>
      <div class="bug-detail-meta"><span>${kindName}</span><span>${platformLabel(mod.platform)}</span><span>${esc(mod.status)}</span></div>
      <div class="mfield"><label>说明</label><div class="bug-detail-text">${esc(mod.description || "待补充模块说明")}</div></div>
      ${note ? `<div class="mfield"><label>关联设计笔记</label><div class="bug-detail-text">${esc(note.title)}</div></div>` : ""}
      <div class="modal-foot">${note ? `<button class="btn solid" data-act="product-note-open" data-id="${note.id}">打开设计笔记</button>` : `<button class="btn" data-act="product-gen-notes">${ic("spark", 12)}生成设计笔记</button>`}<button class="btn" data-act="close-modal">关闭</button></div>`);
			}
			async function openProductNote(id) {
				await loadNotes();
				noteSelected = id;
				ui.noteMode = "edit";
				ui.view = "notes";
				renderAll();
			}
			async function deleteProduct(id) {
				const product = productOf(id);
				if (!(typeof window.confirm === "function" ? window.confirm(`删除项目 / 产品「${product?.name ?? ""}」及其 Demo？对应笔记本与笔记会保留，任务的归属会清空。`) : true)) return;
				try {
					const res = await fetch(`${API}/products/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					products = products.filter((p) => p.id !== id);
					productDemos = productDemos.filter((d) => d.productId !== id);
					productSelected = products[0]?.id ?? null;
					if (product?.workspacePath !== void 0 && ui.project === product.workspacePath) ui.project = "all";
					else if (ui.project !== "all" && ui.project !== "none" && projectByPath(ui.project) === void 0) ui.project = "all";
					closeModal();
					renderAll();
					toast("项目 / 产品已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function dshSessionRows() {
				try {
					const snapshot = (dshCtx?.get?.("sessions"))?.list?.getSnapshot?.();
					if (!snapshot?.ids || !snapshot?.byId) return [];
					return snapshot.ids.map((id) => ({
						id,
						title: snapshot.byId[id]?.title ?? "",
						running: snapshot.byId[id]?.running === true,
						cwd: typeof snapshot.byId[id]?.cwd === "string" ? snapshot.byId[id].cwd : ""
					})).slice(0, 40);
				} catch {
					return [];
				}
			}
			function dshSessions() {
				try {
					const sessions = dshCtx?.get?.("sessions");
					return sessions !== void 0 && typeof sessions.create === "function" ? sessions : void 0;
				} catch {
					return;
				}
			}
			function dshWorkspaceItems() {
				try {
					const snap = (dshCtx?.get?.("workspaces"))?.list?.getSnapshot?.();
					if (snap?.phase === "ready" && Array.isArray(snap.items)) return snap.items;
				} catch {}
				return [];
			}
			function pathKey(path) {
				return path.replace(/[\\/]+$/, "").toLowerCase();
			}
			function workspaceIdOfPath(path) {
				if (path === "") return void 0;
				const key = pathKey(path);
				return dshWorkspaceItems().find((item) => typeof item.path === "string" && pathKey(item.path) === key)?.workspaceId;
			}
			/** 未显式给项目时，回落到门户里选中的项目（避免新会话落到 DSH 默认 cwd）。 */
			function resolveProjectPath(path) {
				if (path !== "") return path;
				return ui.project !== "all" && ui.project !== "none" ? ui.project : "";
			}
			/** 在项目工作区创建会话：优先 workspaceId（会话会挂进侧栏工作区分组），否则退回 cwd。 */
			async function createSessionIn(projectPath) {
				const sessions = dshSessions();
				if (sessions === void 0) throw new Error("当前 DSH 不支持创建会话（缺少 sessions 服务）");
				const target = resolveProjectPath(projectPath);
				const workspaceId = workspaceIdOfPath(target);
				if (workspaceId !== void 0) try {
					return String(await sessions.create({ workspaceId }));
				} catch (cause) {
					console.warn("[dsh-workbench] 按 workspaceId 建会话失败，改用 cwd：", cause);
				}
				return String(await sessions.create(target !== "" ? { cwd: target } : {}));
			}
			/**
			* 向会话追加一轮。三条路：
			* 1) 会话已绑定（正开着）→ 直接 prompt；
			* 2) 未绑定 → 公开的 sessions.retain()（它会启动 opening，ready 才会 resolve）；
			* 3) 老版本没有 retain → retainAgentScope 只借 binding，绝不等 ready。
			* 注意：retainAgentScope 不调用 attachOpening，它的 ready 永远不会 resolve，不能 await。
			*/
			async function sendToSession(sessionId, text) {
				const sessions = dshSessions();
				if (sessions === void 0) throw new Error("当前 DSH 不支持会话发送（缺少 sessions 服务）");
				const send = async (session) => {
					if (session === void 0 || typeof session.prompt !== "function") throw new Error("会话服务不可用");
					const result = await session.prompt([{
						type: "text",
						text
					}], "queue");
					if (result && result.ok === false) throw new Error(result.error?.message ?? "发送失败");
				};
				let direct;
				try {
					direct = sessions.binding?.(sessionId);
				} catch {
					direct = void 0;
				}
				if (direct?.session !== void 0) {
					await send(direct.session);
					return;
				}
				if (typeof sessions.retain === "function") {
					let ref;
					for (let attempt = 0; attempt < 3; attempt += 1) try {
						ref = sessions.retain(sessionId, { source: "gateway" });
						break;
					} catch (cause) {
						if (attempt === 2) throw cause;
						await new Promise((resolve) => window.setTimeout(resolve, 200));
					}
					try {
						Promise.resolve(ref.ready).catch(() => void 0);
						await Promise.race([Promise.resolve(ref.ready), new Promise((_, reject) => window.setTimeout(() => reject(/* @__PURE__ */ new Error("会话打开超时")), 1e4))]);
						await send(ref.binding?.session);
					} finally {
						try {
							ref.release?.();
						} catch {}
					}
					return;
				}
				if (typeof sessions.retainAgentScope === "function") {
					const ref = sessions.retainAgentScope(sessionId);
					try {
						await send(ref.binding?.session);
						return;
					} finally {
						try {
							ref.release?.();
						} catch {}
					}
				}
				throw new Error("当前 DSH 不支持会话发送（缺少 retain 接口）");
			}
			/**
			* 读一个会话已有的事件快照（供灵感页内会话补历史）。
			* 会话没绑定过时用 retain 临时拿一份，读完立刻 release；失败/超时返回空数组，不阻塞 UI。
			*/
			async function readSessionEvents(sessionId) {
				if (sessionId === "") return [];
				const sessions = dshSessions();
				if (sessions === void 0) return [];
				const eventsOf = (ref) => {
					try {
						const snap = ref?.binding?.session?.getSnapshot?.();
						return Array.isArray(snap?.events) ? snap.events : [];
					} catch {
						return [];
					}
				};
				try {
					const direct = sessions.binding?.(sessionId);
					if (direct?.session !== void 0) return eventsOf(direct);
					if (typeof sessions.retain !== "function") return [];
					const ref = sessions.retain(sessionId, { source: "gateway" });
					try {
						Promise.resolve(ref?.ready).catch(() => void 0);
						await Promise.race([Promise.resolve(ref?.ready), new Promise((resolve) => window.setTimeout(resolve, 3e3))]);
						return eventsOf(ref);
					} finally {
						try {
							ref?.release?.();
						} catch {}
					}
				} catch {
					return [];
				}
			}
			async function appendToExistingSession(sessionId, text) {
				try {
					await sendToSession(sessionId, text);
				} catch (cause) {
					try {
						await navigator.clipboard.writeText(text);
					} catch {}
					throw new Error(`${String(cause.message ?? cause)}（提示词已复制到剪贴板）`);
				}
			}
			const agentSessionOffs = [];
			/** 读 Lead 会话的 agentTeam 投影；读不到返回 null（由事件解析降级）。 */
			function teamStateOfSession(sessionId) {
				try {
					return (((dshCtx?.get?.("sessions"))?.list)?.getSnapshot?.())?.projectionsBySession?.[sessionId]?.values?.agentTeam ?? null;
				} catch {
					return null;
				}
			}
			/** 订阅投影变化；返回退订函数（DSH 版本不支持时为空操作）。 */
			function watchTeam(sessionId, callback) {
				const list = (dshCtx?.get?.("sessions"))?.list;
				if (list === void 0 || typeof list.subscribe !== "function") return () => void 0;
				const emit = () => {
					const projection = teamStateOfSession(sessionId);
					if (projection !== null) callback(projection);
				};
				emit();
				try {
					const off = list.subscribe(emit);
					return typeof off === "function" ? off : () => void 0;
				} catch {
					return () => void 0;
				}
			}
			/** 建派发 → 建会话 → 订阅事件 → 发送 kickoff；返回 dispatch/session 供页内会话展示。 */
			async function startAgentDispatch(input, handlers) {
				try {
					let res = await fetch(`${API}/agents/dispatches`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(input)
					});
					let body = await res.json().catch(() => ({}));
					if (res.status === 409) {
						const old = body?.dispatch;
						const started = String(old?.startedAt ?? "");
						if (!(typeof window.confirm === "function" ? window.confirm(`这个灵感还有一次团队执行未结束${started ? `（${started} 开始）` : ""}。\n\n是否停止它，用新任务取代？`) : true)) {
							toast("已取消：请先停止原来的团队任务");
							return null;
						}
						if (old?.id !== void 0) await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(old.id))}`, {
							method: "PATCH",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								status: "cancelled",
								error: "被用户的新派发取代"
							})
						}).catch(() => void 0);
						res = await fetch(`${API}/agents/dispatches`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								...input,
								force: true
							})
						});
						body = await res.json().catch(() => ({}));
					}
					if (!res.ok) {
						toast(body?.message ?? `团队派发失败：HTTP ${res.status}`);
						return null;
					}
					const dispatch = body.dispatch;
					const sessionId = await createSessionIn(input.workspacePath);
					await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(dispatch.id))}`, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							status: "running"
						})
					}).catch(() => void 0);
					if (handlers.team !== void 0) try {
						agentSessionOffs.push(watchTeam(sessionId, handlers.team));
					} catch {}
					const subscribe = dshCtx?.on;
					if (typeof subscribe === "function") try {
						const off = subscribe("session/event", (session, event) => {
							const sid = session?.id ?? session?.sessionId;
							if (String(sid ?? "") === sessionId) handlers.event?.(event);
						});
						if (typeof off === "function") agentSessionOffs.push(off);
					} catch {}
					try {
						await sendToSession(sessionId, String(body.kickoff ?? ""));
					} catch (cause) {
						toast(`会话已建但发送失败：${String(cause.message ?? cause)}`);
						await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(dispatch.id))}`, {
							method: "PATCH",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								status: "failed",
								error: String(cause)
							})
						}).catch(() => void 0);
						return null;
					}
					try {
						const snap = (dshSessions()?.binding?.(sessionId))?.session?.getSnapshot?.();
						if (Array.isArray(snap?.events)) handlers.history?.(snap.events);
					} catch {}
					handlers.status?.("running");
					return {
						dispatchId: String(dispatch.id),
						sessionId,
						teamName: String(body.team?.name ?? ""),
						timeoutMs: Number(dispatch.timeoutMs) || 9e5
					};
				} catch (cause) {
					toast(`团队派发失败：${String(cause.message ?? cause)}`);
					return null;
				}
			}
			async function stopAgentDispatch(dispatchId, sessionId) {
				try {
					await sendToSession(sessionId, "请主理人立即停止当前团队工作，保留已完成的结果，并用一句话说明已停止。");
				} catch {}
				await fetch(`${API}/agents/dispatches/${encodeURIComponent(dispatchId)}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ status: "cancelled" })
				}).catch(() => void 0);
			}
			function focusSession(sessionId) {
				try {
					const nav = dshCtx?.get?.("uiWorkspace");
					if (nav !== void 0 && typeof nav.openSession === "function") nav.openSession(sessionId);
				} catch {}
			}
			/** 新建工作区会话 → 发送提示词 → 回写 → 切到该会话；失败时把提示词放进剪贴板。 */
			async function dispatchToNewSession(projectPath, prompt, onSent, options = {}) {
				try {
					const sessionId = await createSessionIn(projectPath);
					await sendToSession(sessionId, prompt);
					if (onSent !== void 0) try {
						await onSent(sessionId);
					} catch (cause) {
						console.warn("[dsh-workbench] 会话已发出，但回写失败：", cause);
					}
					if (options.focus !== false) {
						focusSession(sessionId);
						toast("已在新会话发出");
					}
					return sessionId;
				} catch (cause) {
					const message = String(cause.message ?? cause);
					db.settings.lastAiError = `${nowStamp()} ${message}`;
					scheduleSave();
					try {
						await navigator.clipboard.writeText(prompt);
					} catch {}
					throw new Error(`${message}（提示词已复制到剪贴板，可手动粘贴到新会话）`);
				}
			}
			/** Bug 提交后回写状态与 AI 会话标记（原刷新链路的 consumePendingRepair 才做这件事）。 */
			async function markBugsDispatched(ids, sessionId) {
				let changed = false;
				for (const id of ids) {
					const bug = bugOf(id);
					if (bug === void 0) continue;
					const next = {
						...bug,
						status: bug.status === "resolved" ? "resolved" : "doing",
						aiThreadId: sessionId
					};
					const index = bugs.findIndex((item) => item.id === id);
					if (index >= 0) bugs[index] = next;
					changed = true;
					try {
						await fetch(`${API}/bugs`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ bug: next })
						});
					} catch (cause) {
						console.warn("[dsh-workbench] Bug 状态回写失败：", cause);
					}
				}
				if (changed && ui.view === "bugs") refreshBugMain();
			}
			/** 本次「AI 协同 / 提交修复」会提交的 Bug 列表（与提示词同源，避免说的和做的不是一批）。 */
			function bugDispatchList() {
				const selected = bugs.filter((bug) => bugSelected.has(bug.id));
				return selected.length > 0 ? selected : bugFiltered().filter((bug) => bug.status !== "resolved").slice(0, 10);
			}
			function defaultDispatchPrompt(kind) {
				const product = productOf(productSelected);
				const testProject = testProjectOf(testProjectSelected);
				if (kind === "product" && product) {
					const mods = productModuleList(product);
					const noteCount = productNoteList(product).length;
					const map = activeMap();
					const mapId = productMapSelected;
					const mapArg = mapId === "" ? "" : `, mapId:"${mapId}"`;
					const mapLine = map === void 0 ? `- 导图：整产品（旧版单导图）` : `- 当前导图：${map.name}（mapId: ${map.id}）${map.description ? ` — ${map.description}` : ""}\n- 同产品其他导图：${productMaps.filter((m) => m.id !== map.id).map((m) => m.name).join("、") || "无"}\n- 本次只处理这张导图；用工具写入时必须带 ${mapArg.slice(2)}`;
					return `产品续做任务：${product.name}

你是资深产品经理，继续推进本产品的设计工作。
- 产品 ID：${product.id}
- 工作区绝对路径：${product.workspacePath || "未关联"}
${mapLine}
- 当前进度：${mods.length} 个模块/业务/功能节点 · ${noteCount} 篇设计笔记 · ${productDemoList(product).length} 个 Demo
- 导图 JSON：${mapMindmap().slice(0, 4e3)}

请检查模块/业务/功能/需求与 PC/移动/平板平台覆盖，找出缺口，然后：
1. 补齐缺失的详细设计：调用 workbench_product_note_publish（含 productId${mapArg}、moduleId、platform、title、content）。
2. 需要拆分结构时调用 workbench_module_publish（含 productId${mapArg}；同名节点会更新，不要担心重复）。
3. 完成后汇报补了哪些模块/笔记。不要只回复正文。`;
				}
				if (kind === "product" && product === void 0) return "产品续做任务：（没有选中产品）\n\n请先在左侧选择一个产品；当前没有可提交的产品，这条提示词不会被执行。";
				if (kind === "test" && testProject === void 0) return "测试续做任务：（没有选中测试项目）\n\n请先在左侧选择一个测试项目；当前没有可提交的测试项目，这条提示词不会被执行。";
				if (kind === "test" && testProject) {
					const cases = testCasesOf(testProject);
					return `测试续做任务：${testProject.name}

你是资深 QA，继续推进本测试项目。
- projectId：${testProject.id}
- 工作区绝对路径：${testProject.workspacePath || "未关联"}
- 产品：${productOf(testProject.productId)?.name ?? "未关联"}
- 当前进度：${cases.length} 条用例 · ${testRunsOf(testProject).length} 次运行

请按模块/端检查用例覆盖缺口，补齐用例（调用 workbench_testcase_publish，同名标题会更新）；若已有失败/阻塞项，分析原因并把问题录入 Bug（调用 workbench_bug_publish）。完成后简短汇报。`;
				}
				const list = bugDispatchList();
				if (list.length === 0) return "当前没有未关闭的 Bug：请检查该工作区的构建与测试现状，列出发现的问题并给出修复建议。";
				return bugPrompt(list);
			}
			function openAiDispatch(kind, presetPrompt) {
				if (kind === "product" && productOf(productSelected) === void 0) {
					toast("先在左侧选择一个产品，再开 AI 协同");
					return;
				}
				if (kind === "test" && testProjectOf(testProjectSelected) === void 0) {
					toast("先在左侧选择一个测试项目，再开 AI 协同");
					return;
				}
				if (kind === "note" && noteById(noteSelected) === void 0) {
					toast("先在左侧选择一篇笔记，再开 AI 协同");
					return;
				}
				if (kind === "bug" && bugDispatchList().length === 0) {
					toast("当前没有可提交的未关闭 Bug");
					return;
				}
				const rows = dshSessionRows();
				const options = rows.length > 0 ? rows.map((row) => {
					const where = row.cwd ? bugWorkspaceName(row.cwd) : "未分组";
					return `<option value="${row.id}">${esc(row.title || row.id.slice(-8))} · ${esc(where)}${row.running ? " · 运行中" : ""}</option>`;
				}).join("") : "<option value=\"\">（无可用已有会话）</option>";
				const withWhere = (name, path) => path !== "" ? `${name} · ${bugWorkspaceName(path)}` : name;
				let where = "默认工作区";
				if (kind === "product") {
					const item = productOf(productSelected);
					if (item !== void 0) where = withWhere(item.name, item.workspacePath);
				} else if (kind === "test") {
					const item = testProjectOf(testProjectSelected);
					if (item !== void 0) where = withWhere(item.name, item.workspacePath);
				} else if (kind === "note") {
					const book = notebookOf(noteById(noteSelected)?.notebookId);
					if (book !== void 0) where = withWhere(book.name, book.workspacePath ?? "");
				} else {
					const item = bugProjectOf(bugDispatchList()[0]?.projectId);
					if (item !== void 0) where = withWhere(item.name, item.workspacePath);
				}
				openModal(`<h3>AI 协同</h3>
      <div class="mfield"><label>执行目标</label><select id="wb-dispatch-target"><option value="">新建会话（${esc(where)}）</option>${options}</select></div>
      <div class="mfield"><label>下一步提示词</label><textarea class="dispatch-prompt" id="wb-dispatch-prompt" rows="6">${esc(presetPrompt ?? defaultDispatchPrompt(kind))}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">新建会话会直接在当前项目工作区创建并发出、不刷新页面；选已有会话则追加一轮（括号里是会话所属工作区）。发送失败时提示词会留在剪贴板。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="ai-dispatch-run" data-kind="${kind}">执行下一步</button></div>`);
			}
			async function runAiDispatch(kind) {
				if (kind === "product" && productOf(productSelected) === void 0) {
					toast("没有选中产品");
					return;
				}
				if (kind === "test" && testProjectOf(testProjectSelected) === void 0) {
					toast("没有选中测试项目");
					return;
				}
				if (kind === "note" && noteById(noteSelected) === void 0) {
					toast("没有选中笔记");
					return;
				}
				const prompt = $id("wb-dispatch-prompt")?.value.trim() ?? "";
				const target = $id("wb-dispatch-target")?.value ?? "";
				if (prompt === "") return;
				try {
					await navigator.clipboard.writeText(prompt);
				} catch {}
				if (target !== "") {
					closeModal();
					try {
						await appendToExistingSession(target, prompt);
						if (kind === "bug") {
							const ids = bugDispatchList().map((bug) => bug.id);
							if (ids.length > 0) await markBugsDispatched(ids, target);
						}
						toast("已追加到已有会话");
					} catch (cause) {
						toast(`追加失败：${String(cause.message ?? cause)}`);
					}
					return;
				}
				closeModal();
				try {
					if (kind === "bug") {
						const list = bugDispatchList();
						if (list.length === 0) {
							toast("没有可提交的 Bug");
							return;
						}
						const projects = Array.from(new Set(list.map((b) => b.projectId)));
						const project = bugProjectOf(projects[0]);
						if (!project?.workspacePath) {
							toast("项目还没关联工作区，请先编辑项目");
							return;
						}
						const submitted = projects.length > 1 ? list.filter((b) => b.projectId === projects[0]) : list;
						if (projects.length > 1) toast(`选中的 Bug 跨 ${projects.length} 个项目，本次仅提交「${project.name}」的 ${submitted.length} 条`);
						await queueRepairSession(project, prompt, submitted.map((b) => b.id));
						return;
					}
					if (kind === "test") {
						await queueTestPrompt(prompt);
						return;
					}
					if (kind === "note") {
						await queueNoteImprove(prompt);
						return;
					}
					await queueProductPrompt(prompt);
				} catch (cause) {
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			function bindProduct() {
				$id("wb-product-select")?.addEventListener("change", (e) => {
					productSelected = e.currentTarget.value;
					productNodeSelected = null;
					productDemoSelected = "";
					productMapSelected = "";
					productMapScopeAll = false;
					productPicked = productDefaultPicked(productOf(productSelected));
					loadProductMaps().then(() => {
						productPicked = productDefaultPicked(productOf(productSelected));
						renderContent();
					});
				});
				$id("wb-map-scope")?.addEventListener("change", (e) => {
					const value = e.currentTarget.value;
					if (value === "all") productMapScopeAll = true;
					else {
						productMapScopeAll = false;
						productMapSelected = value;
					}
					productNodeSelected = null;
					productPicked = productDefaultPicked(productOf(productSelected));
					renderContent();
				});
				$id("wb-product-style")?.addEventListener("change", (e) => {
					productStyle = e.currentTarget.value;
					renderContent();
				});
				$id("wb-product-platform")?.addEventListener("change", (e) => {
					productPlatform = e.currentTarget.value;
					renderContent();
				});
				$id("wb-product-kind")?.addEventListener("change", (e) => {
					productDemoKind = e.currentTarget.value;
					renderContent();
				});
			}
			const PLATFORMS = [
				"all",
				"pc",
				"mobile",
				"tablet"
			];
			function platformLabel(value) {
				return value === "pc" ? "PC" : value === "mobile" ? "移动" : value === "tablet" ? "平板" : "全部";
			}
			function testProjectOf(id) {
				return testProjects.find((p) => p.id === id);
			}
			function testCasesOf(project) {
				return project ? testCases.filter((c) => c.projectId === project.id) : [];
			}
			function testRunsOf(project) {
				return project ? testRuns.filter((r) => r.projectId === project.id) : [];
			}
			function testRunOf(id) {
				return testRuns.find((r) => r.id === id);
			}
			function testResultOf(run, caseId) {
				return run.results.find((r) => r.caseId === caseId) ?? {
					caseId,
					status: "pending",
					note: "",
					bugId: ""
				};
			}
			/** 有效结果 = 用例仍存在的结果（用例被删除后的孤儿结果不计入 KPI，与卡片展示一致）。 */
			function testValidResults(run) {
				return run.results.filter((r) => testCases.some((tc) => tc.id === r.caseId));
			}
			function testCounts(run) {
				const results = testValidResults(run);
				const total = results.length;
				const pass = results.filter((r) => r.status === "pass").length;
				return {
					total,
					pass,
					fail: results.filter((r) => r.status === "fail").length,
					blocked: results.filter((r) => r.status === "blocked").length,
					pending: results.filter((r) => r.status === "pending").length,
					rate: total === 0 ? 0 : Math.round(pass / total * 100)
				};
			}
			const TEST_STATUS_LABEL = {
				running: "进行中",
				passed: "已通过",
				failed: "未通过",
				blocked: "有阻塞"
			};
			const TEST_RESULT_LABEL = {
				pass: "通过",
				fail: "失败",
				blocked: "阻塞",
				pending: "待测"
			};
			async function loadTests(silent = false) {
				if (testLoading) return;
				testLoading = true;
				if (!silent) {
					testError = "";
					if (ui.view === "test") renderContent();
				}
				try {
					const [tRes, pRes, nRes] = await Promise.all([
						fetch(`${API}/tests`),
						fetch(`${API}/products`),
						fetch(`${API}/notes`)
					]);
					if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
					const tData = await tRes.json();
					testProjects = Array.isArray(tData.projects) ? tData.projects : [];
					testCases = Array.isArray(tData.cases) ? tData.cases : [];
					testRuns = Array.isArray(tData.runs) ? tData.runs : [];
					if (pRes.ok) {
						const p = await pRes.json();
						products = Array.isArray(p.products) ? p.products : products;
						productDemos = Array.isArray(p.demos) ? p.demos : productDemos;
						productModules = Array.isArray(p.modules) ? p.modules : productModules;
					}
					if (nRes.ok) {
						const n = await nRes.json();
						notes = Array.isArray(n.notes) ? n.notes : notes;
						notebooks = Array.isArray(n.notebooks) ? n.notebooks : notebooks;
					}
					if (testProjectSelected === null || testProjectOf(testProjectSelected) === void 0) testProjectSelected = testProjects[0]?.id ?? null;
					if (testRunSelected === null || testRunOf(testRunSelected) === void 0) testRunSelected = testRunsOf(testProjectOf(testProjectSelected))[0]?.id ?? null;
					testError = "";
				} catch (cause) {
					if (!silent) testError = String(cause.message ?? cause);
				}
				testLoading = false;
				if (ui.view !== "test") return;
				const sig = JSON.stringify({
					p: testProjects.map((p) => [p.id, p.updatedAt]),
					c: testCases.length,
					r: testRuns.map((r) => [
						r.id,
						r.status,
						r.results.length
					])
				});
				if (!silent || sig !== testSig) {
					testSig = sig;
					if (($id("wb-modal")?.innerHTML ?? "") === "") renderContent();
				}
			}
			function testPrompt(project, source, requirement) {
				const product = productOf(project.productId);
				let context = "";
				if (source === "notes" && product) context = productNoteList(product).map((n) => `## ${n.title}\n${n.content.slice(0, 6e3)}`).join("\n\n");
				else if (source === "demo" && product) {
					const demos = productDemoList(product).map((d) => `- ${d.title}（${PRODUCT_STYLES.find((s) => s.id === d.style)?.name ?? d.style} / ${d.scope === "all" ? "整个产品" : "单功能"}） → ${d.filePath || "（未落盘）"}`).join("\n");
					const mindmapPath = product.workspacePath ? `${product.workspacePath}/.dsh-workbench/products/${product.id}/mindmap.json` : "（产品未关联工作区）";
					context = `产品 Demo（工作区文件，请直接读取）：\n${demos || "（还没有 Demo）"}\n\n导图 JSON：${mindmapPath}\n\n设计笔记：\n${productNoteList(product).map((n) => `## ${n.title}\n${n.content.slice(0, 4e3)}`).join("\n\n")}`;
				}
				const existingTitles = testCasesOf(project).map((c) => `- ${c.title}`).join("\n");
				return `测试用例生成任务

你是资深 QA 与测试架构师。请为测试项目生成可逐条执行的测试用例。

【测试项目】
- projectId：${project.id}
- 名称：${project.name}
- 工作区：${project.workspacePath}
- 产品：${product?.name ?? "未关联产品"}
- 默认端：${platformLabel(project.platform ?? "all")}${project.moduleId ? `
- 默认模块：${productModules.find((m) => m.id === project.moduleId)?.name ?? project.moduleId}` : ""}

【输入来源】${source === "requirement" ? "需求描述" : source === "notes" ? "产品设计笔记" : "产品 Demo + 设计笔记"}

【需求 / 上下文】
${requirement.trim() || "未填写额外需求；请覆盖该产品或项目的主要功能、异常、边界与权限。"}
${context ? `\n【产品上下文】\n${context.slice(0, 3e4)}` : ""}
${existingTitles ? `\n【已有用例（勿重复生成同名/同覆盖用例）】\n${existingTitles}` : ""}

【要求】
1. 每条用例调用一次工具 workbench_testcase_publish，参数：{ projectId:"${project.id}", title, precondition, steps:["..."], expected, priority:"P0|P1|P2|P3", type:"functional|boundary|exception|permission|regression", source:"${source}", moduleId:"模块 id（尽量填写，便于模块覆盖统计）", platform:"pc|mobile|tablet|all" }。
2. 覆盖正例、反例、边界、异常、权限/幂等（按需）；用例步骤要可执行、预期要可判定；标题与上面已有用例不重复。
3. 尽量带上 moduleId / platform，便于按模块和端统计覆盖。
4. 不要只回复用例正文；不要用 write/edit 写文件；唯一交付方式是调用工具。
5. 生成 6-12 条（每个功能 2-4 条 × 功能数，上限 12），完成后简短汇总。`;
			}
			async function queueTestPrompt(prompt) {
				await dispatchToNewSession(testProjectOf(testProjectSelected)?.workspacePath ?? "", prompt);
			}
			function openTestProject(id) {
				const project = testProjectOf(id);
				const workspaces = bugWorkspaceItems();
				const current = project?.workspacePath ?? workspaces[0]?.path ?? "";
				const productOptions = products.map((p) => `<option value="${p.id}" ${p.id === project?.productId ? "selected" : ""}>${esc(p.name)}</option>`).join("");
				openModal(`<h3>${project ? "编辑测试项目" : "新建测试项目"}</h3>
      <div class="mfield"><label>项目名称</label><input id="wb-test-name" value="${esc(project?.name ?? "")}" placeholder="例如：工作台 v1 回归测试"></div>
      <div class="mfield"><label>关联 DSH 工作区</label><select id="wb-test-ws">${workspaces.map((ws) => `<option value="${esc(ws.path)}" ${ws.path === current ? "selected" : ""}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join("")}</select></div>
      <div class="mfield"><label>工作区路径</label><input id="wb-test-path" value="${esc(current)}"></div>
      <div class="mfield"><label>关联产品（可选，用于从笔记/Demo 生成用例）</label><select id="wb-test-product"><option value="">不关联</option>${productOptions}</select></div>
      <div class="mfield"><label>默认模块（可选）</label><select id="wb-test-module"><option value="">不指定</option>${productModules.map((m) => `<option value="${m.id}" ${project?.moduleId === m.id ? "selected" : ""}>${esc(m.name)} · ${m.platform.toUpperCase()}</option>`).join("")}</select></div>
      <div class="mfield"><label>默认端</label><select id="wb-test-platform">${PLATFORMS.map((p) => `<option value="${p}" ${(project?.platform ?? "all") === p ? "selected" : ""}>${platformLabel(p)}</option>`).join("")}</select></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">会自动创建「测试：名称」Bug 项目；用例/报告保存到工作区 .dsh-workbench/tests/。</div>
      <div class="modal-foot">${project ? `<button class="btn" data-act="test-delete" data-id="${project.id}">${ic("trash", 12)}删除项目</button>` : ""}<button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-save" data-id="${project?.id ?? ""}">${project ? "保存" : "创建项目"}</button></div>`);
				$id("wb-test-ws")?.addEventListener("change", (e) => {
					const p = $id("wb-test-path");
					if (p) p.value = e.currentTarget.value;
				});
			}
			async function saveTestProject(id) {
				const name = $id("wb-test-name")?.value.trim() ?? "";
				if (name === "") {
					$id("wb-test-name")?.focus();
					return;
				}
				const existing = testProjectOf(id);
				const body = { project: {
					id: id || void 0,
					name,
					description: existing?.description ?? "",
					workspacePath: $id("wb-test-path")?.value.trim() ?? "",
					productId: $id("wb-test-product")?.value ?? "",
					moduleId: $id("wb-test-module")?.value ?? "",
					platform: $id("wb-test-platform")?.value ?? "all"
				} };
				try {
					const res = await fetch(`${API}/tests/projects`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body)
					});
					const data = await res.json();
					if (!res.ok || !data.project) throw new Error(data.message ?? `HTTP ${res.status}`);
					testProjectSelected = data.project.id;
					testRunSelected = null;
					closeModal();
					await loadTests(true);
					renderContent();
					toast("测试项目已保存");
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			async function deleteTestProject(id) {
				if (!window.confirm("删除测试项目及其用例/运行？工作区报告文件不会删除。")) return;
				try {
					const res = await fetch(`${API}/tests/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					testProjectSelected = null;
					testRunSelected = null;
					closeModal();
					await loadTests(true);
					renderContent();
					toast("测试项目已删除");
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function openTestGen() {
				const project = testProjectOf(testProjectSelected);
				if (!project) {
					toast("先创建测试项目");
					return;
				}
				const productOptions = products.map((p) => `<option value="${p.id}" ${p.id === project.productId ? "selected" : ""}>${esc(p.name)}</option>`).join("");
				openModal(`<h3>AI 生成测试用例</h3>
      <div class="mfield"><label>输入来源</label><select id="wb-test-source"><option value="requirement" ${testGenSource === "requirement" ? "selected" : ""}>手写需求</option><option value="notes" ${testGenSource === "notes" ? "selected" : ""}>产品设计笔记</option><option value="demo" ${testGenSource === "demo" ? "selected" : ""}>产品 Demo + 笔记</option></select></div>
      <div class="mfield"><label>关联产品</label><select id="wb-test-gen-product"><option value="">不选择</option>${productOptions}</select></div>
      <div class="mfield"><label>需求 / 额外要求</label><textarea id="wb-test-req" rows="5" placeholder="例如：测试工作台任务创建、四象限、日历视图；重点覆盖异常与权限">${esc(testGenRequirement)}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 会新建工作区会话并逐条调用 workbench_testcase_publish；消耗额度。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-gen-run">开始生成</button></div>`);
			}
			async function runTestGen() {
				const project = testProjectOf(testProjectSelected);
				if (!project) return;
				const source = $id("wb-test-source")?.value ?? "requirement";
				const requirement = $id("wb-test-req")?.value ?? "";
				if (source === "requirement" && requirement.trim() === "") {
					toast("先输入需求");
					$id("wb-test-req")?.focus();
					return;
				}
				if (source !== "requirement" && project.productId === "") {
					toast("先给测试项目关联产品");
					return;
				}
				testGenSource = source;
				testGenRequirement = requirement;
				if (!window.confirm("AI 将新建会话并生成多条测试用例，继续？")) return;
				const prompt = testPrompt(project, source, requirement);
				try {
					await navigator.clipboard.writeText(prompt);
				} catch {}
				closeModal();
				toast("正在新建用例生成会话…");
				try {
					await queueTestPrompt(prompt);
				} catch (cause) {
					toast(`提交失败：${String(cause.message ?? cause)}`);
				}
			}
			async function startTestRun() {
				const project = testProjectOf(testProjectSelected);
				if (!project) return;
				const cases = testCasesOf(project);
				if (cases.length === 0) {
					toast("先生成测试用例");
					return;
				}
				const run = {
					projectId: project.id,
					name: `测试运行 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
					status: "running",
					results: cases.map((c) => ({
						caseId: c.id,
						status: "pending",
						note: "",
						bugId: ""
					})),
					summary: {}
				};
				try {
					const res = await fetch(`${API}/tests/runs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ run })
					});
					const data = await res.json();
					if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`);
					testRunSelected = data.run.id;
					testTab = "run";
					await loadTests(true);
					renderContent();
				} catch (cause) {
					toast(`启动失败：${String(cause.message ?? cause)}`);
				}
			}
			async function updateTestResult(runId, caseId, status, bugId, note) {
				const run = testRunOf(runId);
				if (!run) return;
				const results = run.results.map((r) => r.caseId === caseId ? {
					...r,
					status,
					bugId: bugId ?? r.bugId,
					note: note ?? r.note
				} : r);
				try {
					const res = await fetch(`${API}/tests/runs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ run: {
							...run,
							results
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`);
					Object.assign(run, data.run);
					renderContent();
				} catch (cause) {
					toast(`更新失败：${String(cause.message ?? cause)}`);
				}
			}
			async function createBugFromTest(runId, caseId) {
				const run = testRunOf(runId);
				const project = testProjectOf(run?.projectId);
				const testCase = testCases.find((c) => c.id === caseId);
				if (!run || !project || !testCase) return;
				if (!project.bugProjectId) {
					toast("该项目还没关联 Bug 项目，请先在测试项目里配置");
					return;
				}
				const result = testResultOf(run, caseId);
				if (result.status === "pass") {
					toast("该用例已通过，不需要录 Bug");
					return;
				}
				const severity = testCase.priority === "P0" ? "blocker" : testCase.priority === "P1" ? "major" : testCase.priority === "P3" ? "trivial" : "minor";
				const description = `来源：测试项目「${project.name}」/ 运行 ${run.name}\n用例：${testCase.title}\n\n前置条件：${testCase.precondition || "-"}\n步骤：\n${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n预期：${testCase.expected}\n实际：${result.note || "未填写"}`;
				try {
					const res = await fetch(`${API}/bugs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ bug: {
							projectId: project.bugProjectId,
							title: `[测试] ${testCase.title}`,
							description,
							status: "open",
							severity,
							priority: testCase.priority,
							platform: testCase.platform || project.platform || "all",
							moduleId: testCase.moduleId || project.moduleId || "",
							tags: [
								"测试",
								project.name,
								testCase.id
							]
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.bug) throw new Error(data.message ?? `HTTP ${res.status}`);
					await updateTestResult(runId, caseId, result.status === "pending" ? "fail" : result.status, data.bug.id);
					toast(`已录入 Bug：${data.bug.id.slice(-6)}`);
				} catch (cause) {
					toast(`录入失败：${String(cause.message ?? cause)}`);
				}
			}
			async function finishTestRun(runId) {
				const run = testRunOf(runId);
				if (!run) return;
				const counts = testCounts(run);
				if (counts.pending > 0) {
					if (!(typeof window.confirm === "function" ? window.confirm(`仍有 ${counts.pending} 条用例未测。完成并生成报告？`) : true)) return;
				}
				const status = counts.fail > 0 ? "failed" : counts.blocked > 0 ? "blocked" : counts.pending > 0 ? "blocked" : "passed";
				const summary = {
					total: counts.total,
					pass: counts.pass,
					fail: counts.fail,
					blocked: counts.blocked,
					pending: counts.pending,
					rate: counts.rate
				};
				try {
					const res = await fetch(`${API}/tests/runs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ run: {
							...run,
							status,
							summary,
							finishedAt: (/* @__PURE__ */ new Date()).toISOString()
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`);
					Object.assign(run, data.run);
					if (status === "passed") for (const result of run.results) {
						if (!result.bugId) continue;
						await fetch(`${API}/bugs/status`, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								bugId: result.bugId,
								status: "verify",
								verification: `回归通过：${run.name}`
							})
						}).catch(() => void 0);
					}
					testTab = "report";
					await loadTests(true);
					renderContent();
					toast(status === "passed" ? "测试通过，报告已生成" : `测试完成：${counts.pass}/${counts.total} 通过`);
				} catch (cause) {
					toast(`完成失败：${String(cause.message ?? cause)}`);
				}
			}
			async function regressionRun() {
				const run = testRunOf(testRunSelected);
				const project = testProjectOf(run?.projectId);
				if (!run || !project) return;
				const failed = run.results.filter((r) => r.status === "fail" || r.status === "blocked");
				if (failed.length === 0) {
					toast("没有失败/阻塞用例");
					return;
				}
				if (!(typeof window.confirm === "function" ? window.confirm(`对 ${failed.length} 条失败/阻塞用例发起回归运行？`) : true)) return;
				try {
					const res = await fetch(`${API}/tests/runs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ run: {
							projectId: project.id,
							name: `回归 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
							status: "running",
							results: failed.map((r) => ({
								caseId: r.caseId,
								status: "pending",
								note: r.note,
								bugId: r.bugId
							})),
							summary: {}
						} })
					});
					const data = await res.json();
					if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`);
					testRunSelected = data.run.id;
					testTab = "run";
					await loadTests(true);
					renderContent();
				} catch (cause) {
					toast(`回归启动失败：${String(cause.message ?? cause)}`);
				}
			}
			function testExecPrompt(project, run) {
				const product = productOf(project.productId);
				const lines = testCasesOf(project).filter((c) => run.results.some((r) => r.caseId === c.id)).map((c, i) => {
					const r = testResultOf(run, c.id);
					return `${i + 1}. caseId=${c.id} [${c.priority}] ${c.title}${r.status !== "pending" ? `（当前：${TEST_RESULT_LABEL[r.status]}）` : ""}
   前置：${c.precondition || "-"}
   步骤：${c.steps.map((s, k) => `${k + 1}) ${s}`).join(" / ")}
   预期：${c.expected}`;
				}).join("\n\n");
				return `测试执行任务

你是资深测试工程师。请在工作区里逐条执行下面的测试用例，把结果回写到工作台，失败的自动录 Bug。

【测试项目】
- projectId：${project.id}
- runId：${run.id}
- 工作区绝对路径：${project.workspacePath || "未关联"}
- 产品：${product?.name ?? "未关联"}
- 端：${platformLabel(project.platform || "all")}

【执行方式】
- 能自动化的用例：在工作区里运行应用/测试脚本/构建后实际验证（如启动服务、调用接口、跑单测）。
- 不能自动化的用例（需人工界面操作）：基于代码与设计笔记推断实际行为，无法确定时状态写 blocked 并在 note 说明"需人工验证"。
- 不伪造结果；没跑过就不要写 pass。

【回写工具（每条用例执行完立即调用）】
workbench_test_result_publish
参数：{ projectId:"${project.id}", runId:"${run.id}", caseId, status:"pass|fail|blocked", note:"实际结果/证据", bugTitle:"失败时的 Bug 标题（可选）", bugDescription:"失败时的复现步骤（可选）" }

【硬性约束】
- 一次只执行一条，回写后再做下一条。
- 不修改与测试无关的文件；不执行 git commit/push。
- 全部完成后简短汇总：通过 N / 失败 M / 阻塞 K，失败项对应的 Bug。

【用例清单】

${lines}`;
			}
			async function queueTestExec(project, run) {
				const prompt = testExecPrompt(project, run);
				await dispatchToNewSession(project.workspacePath, prompt);
			}
			function openTestExecDispatch() {
				const project = testProjectOf(testProjectSelected);
				const run = testRunOf(testRunSelected) ?? testRunsOf(project)[0];
				if (!project || !run) {
					toast("先启动一次测试运行");
					return;
				}
				const rows = dshSessionRows();
				openModal(`<h3>AI 自动化测试</h3>
      <div class="mfield"><label>执行目标</label><select id="wb-dispatch-target"><option value="">新建工作区会话</option>${rows.length > 0 ? rows.map((row) => `<option value="${row.id}">${esc(row.title || row.id.slice(-8))}${row.running ? " · 运行中" : ""}</option>`).join("") : "<option value=\"\">（无可用已有会话）</option>"}</select></div>
      <div class="mfield"><label>测试执行提示词</label><textarea class="dispatch-prompt" id="wb-dispatch-prompt" rows="6">${esc(testExecPrompt(project, run))}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 将逐条执行用例并通过 workbench_test_result_publish 回写结果；失败项可自动录 Bug。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-exec-run" data-run="${run.id}">开始执行</button></div>`);
			}
			function testReportHtml(project, run) {
				const c = testCounts(run);
				const cards = run.results.map((r) => testCases.find((tc) => tc.id === r.caseId)).filter((tc) => Boolean(tc)).map((tc) => {
					const r = testResultOf(run, tc.id);
					const color = r.status === "pass" ? "#34d399" : r.status === "fail" ? "#fb7185" : r.status === "blocked" ? "#fbbf24" : "#64748b";
					return `<article class="case ${r.status}"><header><span>${esc(tc.priority)}</span><b>${esc(tc.title)}</b><i style="--c:${color}">${TEST_RESULT_LABEL[r.status] ?? r.status}</i></header><p>${esc(tc.expected)}</p>${r.note ? `<small>${esc(r.note)}</small>` : ""}</article>`;
				}).join("");
				return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.name)} · 测试报告</title><style>
      :root{--bg:#070b14;--panel:#0e1626;--line:#1e2c44;--text:#e8eefc;--muted:#8ca0c0;--accent:#5b8cff}
      *{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 20% 0%,#16244a,transparent 60%),var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC",sans-serif}
      .wrap{max-width:1100px;margin:0 auto;padding:38px 28px 70px}.top{display:flex;align-items:center;gap:12px}.brand{font-weight:800;font-size:22px;letter-spacing:-.4px}.badge{border:1px solid var(--line);border-radius:99px;padding:3px 9px;font-size:10px;color:var(--muted)}
      h1{font-size:38px;margin:22px 0 4px;letter-spacing:-1px}.sub{color:var(--muted);font-size:13px}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:26px 0}
      .kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.kpi b{display:block;font-size:26px}.kpi span{font-size:10px;color:var(--muted)}.kpi.pass b{color:#34d399}.kpi.fail b{color:#fb7185}.kpi.blocked b{color:#fbbf24}
      .report{display:grid;grid-template-columns:270px 1fr;gap:16px}.ring{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center}.ring .donut{width:150px;height:150px;border-radius:50%;margin:10px auto;background:conic-gradient(#34d399 0 ${c.rate}%,#fb7185 ${c.rate}% ${c.rate + (c.total ? c.fail / c.total * 100 : 0)}%,#334155 0);display:grid;place-items:center;position:relative;box-shadow:0 0 40px #34d39933}
      .ring .donut::after{content:'';position:absolute;inset:16px;border-radius:50%;background:var(--panel)}.ring .donut b{position:relative;z-index:1;font-size:30px}
      .bars{display:flex;align-items:flex-end;gap:10px;height:230px;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:14px;perspective:700px}
      .bar{flex:1;min-width:14px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#5b8cff,#2e4b9c);transform-origin:bottom;animation:grow 1s cubic-bezier(.2,.8,.2,1) both;height:var(--h)}
      .bar.pass{background:linear-gradient(180deg,#34d399,#166534)}.bar.fail{background:linear-gradient(180deg,#fb7185,#7f1d1d)}.bar.pending{background:linear-gradient(180deg,#64748b,#1e293b)}
      @keyframes grow{from{transform:scaleY(0) rotateX(30deg);opacity:.2}to{transform:scaleY(1) rotateX(0);opacity:1}}
      .cases{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.case{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:10px 12px}.case header{display:flex;align-items:center;gap:7px}.case header span{font-size:9px;color:var(--accent)}.case header b{font-size:11.5px;flex:1}.case header i{font-style:normal;font-size:9px;color:var(--c);border:1px solid var(--c);border-radius:99px;padding:1px 6px}.case p{font-size:10px;color:var(--muted);margin:6px 0 0}.case small{font-size:9.5px;color:#fbbf24}.foot{margin-top:24px;color:var(--muted);font-size:10px}
      @media(max-width:800px){.kpis{grid-template-columns:1fr 1fr}.report{grid-template-columns:1fr}.cases{grid-template-columns:1fr}}
    </style></head><body><div class="wrap"><div class="top"><span class="brand">${esc(project.name)}</span><span class="badge">测试报告</span><span class="badge">${TEST_STATUS_LABEL[run.status] ?? esc(run.status)}</span></div><h1>${esc(run.name)}</h1><div class="sub">${run.createdAt} · ${esc(project.workspacePath)}</div>
      <div class="kpis"><div class="kpi"><b>${c.total}</b><span>用例</span></div><div class="kpi pass"><b>${c.pass}</b><span>通过</span></div><div class="kpi fail"><b>${c.fail}</b><span>失败</span></div><div class="kpi blocked"><b>${c.blocked}</b><span>阻塞</span></div><div class="kpi"><b>${c.rate}%</b><span>通过率</span></div></div>
      <div class="report"><div class="ring"><div class="donut"><b>${c.rate}%</b></div><span class="sub">通过率</span></div><div class="bars">${Array.from({ length: Math.max(1, c.total) }, (_, i) => `<div class="bar ${i < c.pass ? "pass" : i < c.pass + c.fail ? "fail" : "pending"}" style="--h:${Math.max(12, 25 + (i + 1) / Math.max(1, c.total) * 75)}%"></div>`).join("")}</div></div>
      <div class="cases">${cards}</div><div class="foot">由工作台测试模块生成 · ${(/* @__PURE__ */ new Date()).toLocaleString()}</div></div></body></html>`;
			}
			async function saveTestReport() {
				const project = testProjectOf(testProjectSelected);
				const run = testRunOf(testRunSelected);
				if (!project || !run) {
					toast("先完成一次运行");
					return;
				}
				try {
					const res = await fetch(`${API}/tests/report`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							projectId: project.id,
							runId: run.id,
							html: testReportHtml(project, run)
						})
					});
					const data = await res.json();
					if (!res.ok || !data.filePath) throw new Error(data.message ?? `HTTP ${res.status}`);
					toast(`报告已保存：${data.filePath.split("/").slice(-2).join("/")}`);
				} catch (cause) {
					toast(`保存失败：${String(cause.message ?? cause)}`);
				}
			}
			function renderTestReport(project, run) {
				const c = testCounts(run);
				const bars = Array.from({ length: Math.max(1, c.total) }, (_, i) => `<i class="${i < c.pass ? "pass" : i < c.pass + c.fail ? "fail" : "pending"}" style="--h:${Math.max(12, 25 + (i + 1) / Math.max(1, c.total) * 75)}%;--d:${i * 40}ms"></i>`).join("");
				const cards = run.results.map((r) => testCases.find((tc) => tc.id === r.caseId)).filter((tc) => Boolean(tc)).map((tc) => {
					const r = testResultOf(run, tc.id);
					return `<div class="test-report-card ${r.status}"><span>${esc(tc.priority)}</span><b>${esc(tc.title)}</b><i>${TEST_RESULT_LABEL[r.status] ?? r.status}</i></div>`;
				}).join("");
				return `<div class="test-report"><div class="test-report-hero"><div><span class="eyebrow">测试报告</span><h2>${esc(run.name)}</h2><div class="muted">${esc(project.name)} · ${run.createdAt}</div></div><button class="btn" data-act="test-report-save">${ic("download", 12)}保存报告</button></div>
      <div class="test-kpis"><div><b>${c.total}</b><span>用例</span></div><div class="ok"><b>${c.pass}</b><span>通过</span></div><div class="bad"><b>${c.fail}</b><span>失败</span></div><div class="warn"><b>${c.blocked}</b><span>阻塞</span></div><div><b>${c.rate}%</b><span>通过率</span></div></div>
      <div class="test-report-grid"><div class="test-ring" style="--rate:${c.rate}%"><b>${c.rate}%</b><span>通过率</span></div><div class="test-bars">${bars}</div></div>
      <div class="test-report-cards">${cards || "<div class=\"notes-empty small\">没有用例</div>"}</div>
      <div class="test-timeline"><span>生成用例</span><i></i><span>执行</span><i></i><span>失败录入</span><i></i><span>回归</span><i></i><span>${run.status === "running" ? "进行中" : run.status === "passed" ? "通过" : "已完成"}</span></div></div>`;
			}
			function renderTests() {
				const project = testProjectOf(testProjectSelected);
				const header = `<div class="view-head"><div><div class="eyebrow">测试</div><h1 class="page-title">测试</h1><div class="page-sub">AI 生成用例 → 执行 → 录入 Bug → 回归 → 动画报告</div><div class="head-pills"><span><b>${testCases.length}</b> 用例</span><span><b>${testRuns.length}</b> 运行</span><span><b>${testProjects.length}</b> 项目</span></div></div><div style="display:flex;gap:6px"><button class="btn" data-act="ai-dispatch" data-kind="test">${ic("spark", 13)}AI 协同</button><button class="btn-primary" data-act="test-new">${ic("plus", 14)}新建测试项目</button></div></div>`;
				if (testError !== "") return header + `<div class="news-banner"><span>读取失败：${esc(testError)}</span><button class="btn" data-act="test-refresh">重试</button></div>`;
				if (testProjects.length === 0) return header + `<div class="notes-empty bug-empty"><div class="ne-icon">${ic("test", 22)}</div><b>还没有测试项目</b><span>创建项目并关联工作区，AI 生成用例后逐条测试。</span><button class="btn-primary" data-act="test-new">${ic("plus", 14)}新建测试项目</button></div>`;
				if (!project) return header;
				const tabs = `<div class="product-tabs">${[
					"cases",
					"run",
					"report",
					"deploy"
				].map((t) => `<button class="${testTab === t ? "active" : ""}" data-act="test-tab" data-tab="${t}">${t === "cases" ? "用例" : t === "run" ? "执行" : t === "report" ? "报告" : "部署"}</button>`).join("")}</div>`;
				const toolbar = `<div class="product-toolbar"><select id="wb-test-select" class="bug-project-select"><option value="">选择测试项目…</option>${testProjects.map((p) => `<option value="${p.id}" ${p.id === project.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><button class="icon-btn" data-act="test-edit" title="编辑">${ic("edit", 14)}</button><span class="product-ws">${ic("folder", 12)}${esc(project.workspacePath || "未关联工作区")}</span><button class="icon-btn" data-act="test-refresh" title="刷新">${ic("refresh", 14)}</button></div>`;
				let body = "";
				if (testTab === "cases") {
					const cases = testCasesOf(project);
					body = `<div class="product-panel-head"><div><b>测试用例（${cases.length}）</b><span>AI 按需求 / 产品笔记 / Demo 生成</span></div><div class="product-actions"><button class="btn-primary" data-act="test-gen">${ic("spark", 12)}AI 生成用例</button></div></div><div class="test-case-list">${cases.map((c) => `<div class="test-case"><div class="test-case-head"><span class="test-prio p${c.priority.slice(1)}">${c.priority}</span><b>${esc(c.title)}</b><i>${esc(c.source)}</i><span class="platform ${c.platform || "all"}">${platformLabel(c.platform || "all")}</span><button class="icon-btn" data-act="test-case-delete" data-id="${c.id}" title="删除">${ic("trash", 12)}</button></div><div class="test-case-meta">${c.precondition ? `前置：${esc(c.precondition)}` : ""}</div><ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><div class="test-expected">预期：${esc(c.expected)}</div></div>`).join("") || "<div class=\"notes-empty small\">还没有用例，点「AI 生成用例」。</div>"}</div>`;
				} else if (testTab === "run") {
					const runs = testRunsOf(project);
					const run = testRunOf(testRunSelected) ?? runs[0];
					if (!run) body = `<div class="notes-empty small">还没有运行。<button class="btn-primary" data-act="test-start">${ic("play", 12)}开始测试</button></div>`;
					else {
						const c = testCounts(run);
						body = `<div class="product-panel-head"><div><b>${esc(run.name)}</b><span>${c.pass}/${c.total} 通过 · ${TEST_STATUS_LABEL[run.status] ?? run.status} · ${platformLabel(project.platform || "all")}</span></div><div class="product-actions"><button class="btn" data-act="test-start">${ic("plus", 12)}新运行</button><button class="btn" data-act="test-exec">${ic("spark", 12)}AI 自动化测试</button>${run.status !== "running" ? `<button class="btn" data-act="test-regression">${ic("refresh", 12)}回归失败用例</button>` : ""}<button class="btn-primary" data-act="test-finish" data-id="${run.id}">${ic("check", 12)}完成并生成报告</button></div></div>
          <div class="test-live-stage"><div class="test-live-ring" style="--rate:${c.rate}%"><b>${c.rate}%</b><span>实时通过率</span></div><div class="test-live-bars">${run.results.map((r, i) => `<i class="${r.status}" style="--h:${Math.max(12, 20 + (i + 1) / Math.max(1, run.results.length) * 80)}%;--d:${i * 45}ms"></i>`).join("")}<div class="test-live-scan"></div></div><div class="test-live-legend"><span>通过 ${c.pass}</span><span>失败 ${c.fail}</span><span>阻塞 ${c.blocked}</span><span>待测 ${c.pending}</span></div></div>
          <div class="test-run-list">${run.results.map((r) => testCases.find((tc) => tc.id === r.caseId)).filter((tc) => Boolean(tc)).map((tc) => {
							const r = testResultOf(run, tc.id);
							return `<div class="test-run-case ${r.status}"><div><span class="test-prio p${tc.priority.slice(1)}">${tc.priority}</span><b>${esc(tc.title)}</b><small>${esc(tc.expected)}</small></div><div class="test-run-actions">${[
								"pass",
								"fail",
								"blocked"
							].map((s) => `<button class="${r.status === s ? "on" : ""}" data-act="test-result" data-run="${run.id}" data-case="${tc.id}" data-status="${s}">${TEST_RESULT_LABEL[s]}</button>`).join("")}${r.status !== "pass" ? `<button class="btn" data-act="test-bug" data-run="${run.id}" data-case="${tc.id}">录 Bug</button>` : ""}${r.bugId ? `<i class="test-bug-id">${r.bugId.slice(-6)}</i>` : ""}</div><input class="test-note" data-test-note="${tc.id}" placeholder="实际结果/证据" value="${esc(r.note)}"></div>`;
						}).join("")}</div>`;
					}
				} else if (testTab === "report") {
					const run = testRunOf(testRunSelected) ?? testRunsOf(project)[0];
					body = run ? renderTestReport(project, run) : "<div class=\"notes-empty small\">先完成一次运行。</div>";
				} else body = `<div class="test-deploy"><div class="mfield"><label>部署模式</label><select id="wb-deploy-mode"><option value="local" ${project.deployMode === "local" ? "selected" : ""}>本机 Docker</option><option value="ssh" ${project.deployMode === "ssh" ? "selected" : ""}>SSH 服务器 Docker</option></select></div>
        <div class="test-deploy-grid"><div class="mfield"><label>SSH 主机</label><input id="wb-deploy-host" value="${esc(project.sshHost)}" placeholder="user@host"></div><div class="mfield"><label>远端目录</label><input id="wb-deploy-dir" value="${esc(project.remoteDir)}" placeholder="/srv/app"></div></div>
        <div class="test-deploy-grid"><div class="mfield"><label>镜像</label><input id="wb-deploy-image" value="${esc(project.image)}" placeholder="dsh-workbench-test"></div><div class="mfield"><label>容器名</label><input id="wb-deploy-container" value="${esc(project.containerName)}" placeholder="dsh-workbench-test"></div></div>
        <div class="test-deploy-grid"><div class="mfield"><label>宿主端口</label><input id="wb-deploy-hostport" value="${esc(project.hostPort)}" placeholder="8080"></div><div class="mfield"><label>容器端口</label><input id="wb-deploy-containerport" value="${esc(project.containerPort)}" placeholder="80"></div></div>
        <div class="product-actions"><button class="btn-primary" data-act="test-deploy">${ic("upload", 12)}保存并部署</button></div><pre class="test-deploy-log">${esc(testDeployLog || "部署日志会显示在这里。Docker 未运行时请先启动 Docker。")}</pre></div>`;
				return header + toolbar + tabs + body;
			}
			async function deployTestProject() {
				const project = testProjectOf(testProjectSelected);
				if (!project) return;
				const patch = {
					id: project.id,
					name: project.name,
					description: project.description,
					workspacePath: project.workspacePath,
					productId: project.productId,
					bugProjectId: project.bugProjectId,
					deployMode: $id("wb-deploy-mode")?.value ?? "local",
					sshHost: $id("wb-deploy-host")?.value ?? "",
					remoteDir: $id("wb-deploy-dir")?.value ?? "",
					image: $id("wb-deploy-image")?.value ?? "",
					containerName: $id("wb-deploy-container")?.value ?? "",
					hostPort: $id("wb-deploy-hostport")?.value ?? "",
					containerPort: $id("wb-deploy-containerport")?.value ?? ""
				};
				try {
					await fetch(`${API}/tests/projects`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ project: patch })
					});
					testDeployLog = "正在部署……";
					renderContent();
					const res = await fetch(`${API}/tests/deploy`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ projectId: project.id })
					});
					const data = await res.json();
					testDeployLog = data.log ?? `HTTP ${res.status}`;
					await loadTests(true);
					renderContent();
					toast(data.ok ? "部署成功" : "部署失败，查看日志");
				} catch (cause) {
					testDeployLog = String(cause.message ?? cause);
					renderContent();
				}
			}
			async function deleteTestCase(id) {
				if (!window.confirm("删除这条测试用例？")) return;
				try {
					const res = await fetch(`${API}/tests/cases/${encodeURIComponent(id)}`, { method: "DELETE" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					testCases = testCases.filter((c) => c.id !== id);
					renderContent();
				} catch (cause) {
					toast(`删除失败：${String(cause.message ?? cause)}`);
				}
			}
			function bindTests() {
				$id("wb-test-select")?.addEventListener("change", (e) => {
					testProjectSelected = e.currentTarget.value;
					testRunSelected = null;
					testTab = "cases";
					renderContent();
				});
				shadow.querySelectorAll("[data-test-note]").forEach((input) => input.addEventListener("change", (e) => {
					const caseId = e.currentTarget.getAttribute("data-test-note") ?? "";
					const run = testRunOf(testRunSelected);
					if (!run) return;
					updateTestResult(run.id, caseId, testResultOf(run, caseId).status, void 0, e.currentTarget.value);
				}));
			}
			function renderDetail() {
				const el = detail();
				if (!el) return;
				const show = ![
					"portal",
					"calendar",
					"focus",
					"stats",
					"news",
					"notes",
					"bugs",
					"product",
					"test"
				].includes(ui.view);
				el.classList.toggle("hide", !show);
				if (!show) {
					el.innerHTML = "";
					return;
				}
				const t = selectedTask();
				if (!t) {
					el.innerHTML = "<div class=\"detail-empty\">还没有选中任务<br>从左边的看板或清单点一项任务</div>";
					return;
				}
				const space = spaceOf(t.space);
				const tabs = [
					["detail", "详情"],
					[
						"subtasks",
						"子待办",
						t.subtasks.length
					],
					["logs", "记录"]
				];
				let body = "";
				if (ui.detailTab === "detail") body = `<div class="d-head">${ic("note", 12)} 任务详情<span class="acts">
          <button class="icon-btn" data-act="refresh" title="刷新">${ic("refresh", 13)}</button>
          <button class="icon-btn" data-act="focus-title" title="编辑">${ic("edit", 13)}</button>
          <button class="icon-btn" data-act="copy" data-id="${t.id}" title="复制">${ic("copy", 13)}</button>
          <button class="icon-btn" data-act="delete" data-id="${t.id}" title="删除">${ic("trash", 13)}</button></span></div>
        <div class="d-title-row"><button class="check${t.status === "done" ? " done" : ""}" data-act="toggle" data-id="${t.id}">${t.status === "done" ? ic("check", 11) : ""}</button>
          <div class="d-title" contenteditable="true" data-edit-title="${t.id}">${esc(t.title)}</div></div>
        ${field("项目", "layers", t.projectPath ? `<b>${esc(projectLabelOfTask(t))}</b>` : "<span class=\"muted\">未归属</span>", "project", t.id)}
        ${field("空间", "folder", `<span class="dot" style="background:${space.color}"></span>${esc(space.name)}`, "space", t.id)}
        ${field("日期", "calendar", `${t.date === todayKey() ? "今天" : t.date ? fmtDay(t.date) : "未安排"} <span class="muted">${t.date ?? ""}</span>`, "date", t.id)}
        ${field("时间", "clock", `${timeText(t)}${t.duration ? ` <span class="muted">· ${t.duration} 分钟</span>` : ""}`, "time", t.id)}
        ${field("执行", "play", t.status === "doing" ? `<span class="pill green">${ic("playSmall", 9)}进行中</span>` : t.status === "done" ? "<span class=\"pill gray\">已完成</span>" : "<span class=\"pill amber\">" + ic("playSmall", 9) + "待开始</span>", "status", t.id)}
        ${field("优先级", "flag", t.priority === "high" ? "<span style=\"color:var(--red)\">高优先级</span>" : PRIORITY_LABEL[t.priority], "priority", t.id)}
        ${field("标签", "tag", t.tags.length > 0 ? t.tags.map((x) => `<span class="tag">#${esc(x)}</span>`).join("") : "<span class=\"muted\">未设置</span>", "tags", t.id)}
        ${field("分组", "folder", t.group ? esc(t.group) : "<span class=\"muted\">未设置</span>", "group", t.id)}
        <div class="d-sec"><div class="d-sec-h">${ic("note", 11)} 备注</div>
          <div class="d-note" contenteditable="true" data-edit-note="${t.id}">${esc(t.note || t.desc || "点击输入备注…")}</div>
          <div class="attach-row"><button class="btn" data-act="pick-image">${ic("image", 11)}添加图片</button><button class="btn" data-act="pick-file">${ic("paperclip", 11)}添加附件</button><span style="margin-left:auto">${t.attachments.length}/12</span></div>
          <input type="file" id="wb-file" class="attach-hidden" multiple>
          <div class="attachments">${t.attachments.map((a) => `<div class="attach"><span class="file-ic">${esc(String(a.kind).toUpperCase())}</span><span>${esc(a.name)}</span><span class="x" data-act="del-attach" data-id="${t.id}" data-aid="${a.id}">×</span></div>`).join("") || "<div class=\"muted\" style=\"font-size:10.5px\">暂无附件</div>"}</div>
        </div>
        <div class="d-sec"><div class="d-sec-h">${ic("clock", 11)} 接下来</div>
          ${db.tasks.filter((x) => x.id !== t.id && x.status !== "done" && x.date === todayKey()).slice(0, 3).map((x) => `<div class="next-item" data-id="${x.id}"><span class="t">${x.start || "--:--"}</span><span>${esc(x.title)}</span></div>`).join("") || "<div class=\"muted\" style=\"font-size:10.5px\">今天没有其他安排</div>"}
        </div>`;
				else if (ui.detailTab === "subtasks") {
					const doneN = t.subtasks.filter((s) => s.done).length;
					const notedSub = t.subtasks.find((s) => s.id === ui.subNoteId) ?? t.subtasks[0];
					body = `<div class="d-head" style="margin-top:2px">${ic("checkSquare", 12)}子待办<span class="acts" style="font-size:10px;color:var(--text-3)">${doneN}/${t.subtasks.length} 已完成</span></div>
        ${t.subtasks.map((s) => `<div class="sub-item${s.done ? " done" : ""}">
          <button class="check${s.done ? " done" : ""}" data-act="toggle-sub" data-id="${t.id}" data-sid="${s.id}">${s.done ? ic("check", 10) : ""}</button>
          <div class="sm"><div class="st">${esc(s.title)}</div><span data-act="sub-plan" data-id="${t.id}" data-sid="${s.id}" title="点击编辑计划时间" style="cursor:pointer">${s.start ? `${s.start} — ${s.end}` : "未排期 · 点击设置时间"}</span>
          ${ui.subNoteId === s.id ? `<textarea class="sub-note-input" data-sub-note-editor data-task="${t.id}" data-sid="${s.id}" placeholder="这条子待办的独立备注…">${esc(s.note)}</textarea>` : ""}</div>
          <button class="icon-btn" title="备注" data-act="sub-note" data-sid="${s.id}">${ic("note", 12)}</button></div>`).join("") || "<div class=\"muted\" style=\"font-size:11px;padding:6px 0\">还没有子待办</div>"}
        <div class="sub-add">${ic("plus", 12)}<input id="wb-sub-add" placeholder="添加子待办，按 Enter 保存"></div>
        <div class="d-sec"><div class="d-sec-h">${ic("calendar", 11)} 计划时间</div>
          <div class="plan-grid" data-act="sub-plan" data-id="${t.id}" data-sid="${notedSub?.id ?? ""}" style="cursor:pointer"><div class="plan-box">计划开始<b>${notedSub?.start || t.start || "未设置"}</b></div><div class="plan-box">计划完成<b>${notedSub?.end || t.end || "未设置"}</b></div></div>
        </div>
        ${notedSub ? `<div class="d-sec"><div class="d-sec-h">${ic("note", 11)} 独立备注${notedSub.title ? ` · ${esc(notedSub.title)}` : ""}</div><div class="d-note" contenteditable="true" data-edit-sub-note="${t.id}" data-sub-target="${notedSub.id}">${esc(notedSub.note || "")}</div></div>` : ""}`;
				} else body = `<div class="d-head" style="margin-top:2px">${ic("clock", 12)}记录<span class="acts" style="font-size:10px;color:var(--text-3)">${t.logs.length} 条</span></div>
        ${t.logs.map((l) => `<div class="log"><span class="lt">${esc(l.at)}</span><span>${esc(l.text)}</span></div>`).join("") || "<div class=\"detail-empty\">暂无记录</div>"}`;
				el.innerHTML = `<div class="detail-tabs">${tabs.map(([k, label, n]) => `<button data-act="tab" data-tab="${k}" class="${ui.detailTab === k ? "active" : ""}">${label}${n !== void 0 ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      <div class="detail-body">${body}</div>`;
				bindDetail();
			}
			function field(label, iconName, value, key, taskId) {
				return `<div class="field" role="button" tabindex="0" data-act="edit-field" data-field="${key}" data-id="${taskId}" title="点击编辑"><span class="fl">${ic(iconName, 11)}${label}</span><span class="fv">${value}</span></div>`;
			}
			function bindDetail() {
				const title = shadow.querySelector("[data-edit-title]");
				if (title) {
					title.addEventListener("blur", () => {
						const id = title.getAttribute("data-edit-title") ?? "";
						const task = taskOf(id);
						const value = title.textContent?.trim() ?? "";
						if (task && value !== "" && value !== task.title) {
							task.title = value;
							task.updatedAt = nowStamp();
							task.logs.unshift({
								at: nowStamp(),
								type: "edit",
								text: `重命名为「${value}」`
							});
							scheduleSave();
							renderSidebar();
							renderContent();
						}
					});
					title.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							title.blur();
						}
					});
				}
				const note = shadow.querySelector("[data-edit-note]");
				if (note) {
					note.addEventListener("paste", (event) => {
						const task = selectedTask();
						const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
						if (!task || files.length === 0) return;
						event.preventDefault();
						let added = 0;
						for (const f of files) {
							if (task.attachments.length >= 12) {
								toast("附件最多 12 个");
								break;
							}
							task.attachments.push({
								id: uid("a"),
								name: f.name || `图片-${Date.now()}.png`,
								kind: "image",
								size: f.size
							});
							added += 1;
						}
						if (added > 0) {
							renderAll();
							scheduleSave();
							toast(`已添加 ${added} 张图片`);
						}
					});
					note.addEventListener("blur", () => {
						const id = note.getAttribute("data-edit-note") ?? "";
						const task = taskOf(id);
						const value = note.textContent ?? "";
						if (task && value !== (task.note || task.desc)) {
							task.note = value;
							task.updatedAt = nowStamp();
							scheduleSave();
						}
					});
				}
				const subNote = shadow.querySelector("[data-edit-sub-note]");
				if (subNote) subNote.addEventListener("blur", () => {
					const id = subNote.getAttribute("data-edit-sub-note") ?? "";
					const task = taskOf(id);
					const sub = task?.subtasks.find((s) => s.id === subNote.getAttribute("data-sub-target"));
					if (task && sub && subNote.textContent !== sub.note) {
						sub.note = subNote.textContent ?? "";
						scheduleSave();
					}
				});
				shadow.querySelectorAll("[data-sub-note-editor]").forEach((editor) => {
					editor.addEventListener("blur", () => {
						const task = taskOf(editor.getAttribute("data-task") ?? "");
						const sub = task?.subtasks.find((s) => s.id === editor.getAttribute("data-sid"));
						if (task && sub && sub.note !== editor.value) {
							sub.note = editor.value;
							task.updatedAt = nowStamp();
							scheduleSave();
						}
					});
					editor.addEventListener("keydown", (e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) editor.blur();
					});
				});
				const subAdd = $id("wb-sub-add");
				subAdd?.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && subAdd.value.trim() !== "") {
						const task = selectedTask();
						if (!task) return;
						task.subtasks.push({
							id: uid("s"),
							title: subAdd.value.trim(),
							done: false,
							start: "",
							end: "",
							note: ""
						});
						task.updatedAt = nowStamp();
						task.logs.unshift({
							at: nowStamp(),
							type: "edit",
							text: `添加子待办「${subAdd.value.trim()}」`
						});
						renderAll();
						scheduleSave();
						window.setTimeout(() => {
							$id("wb-sub-add")?.focus();
						}, 0);
					}
				});
				const fileInput = $id("wb-file");
				fileInput?.addEventListener("change", () => {
					const task = selectedTask();
					if (!task || fileInput.files === null) return;
					for (const f of Array.from(fileInput.files)) {
						if (task.attachments.length >= 12) {
							toast("附件最多 12 个");
							break;
						}
						task.attachments.push({
							id: uid("a"),
							name: f.name,
							kind: fileKind(f.name),
							size: f.size
						});
					}
					fileInput.value = "";
					renderAll();
					scheduleSave();
				});
			}
			function createTask(input) {
				const task = {
					id: uid("t"),
					title: input.title,
					desc: input.desc ?? "",
					note: "",
					space: input.space ?? db.spaces[2]?.id ?? "life",
					projectPath: input.projectPath ?? (ui.project === "all" || ui.project === "none" ? "" : ui.project),
					status: "next",
					priority: input.priority ?? "normal",
					tags: [],
					date: input.date ?? todayKey(),
					start: input.start ?? "",
					end: input.end ?? "",
					duration: 0,
					group: "",
					createdAt: nowStamp(),
					updatedAt: nowStamp(),
					completedAt: null,
					subtasks: [],
					attachments: [],
					logs: [{
						at: nowStamp(),
						type: "created",
						text: "创建任务"
					}]
				};
				db.tasks.unshift(task);
				ui.selected = task.id;
				renderAll();
				scheduleSave();
				toast("已创建任务");
			}
			function toggleDone(id) {
				const task = taskOf(id);
				if (!task) return;
				const done = task.status !== "done";
				task.status = done ? "done" : "next";
				task.completedAt = done ? nowStamp() : null;
				task.updatedAt = nowStamp();
				task.logs.unshift({
					at: nowStamp(),
					type: done ? "completed" : "status",
					text: done ? "完成任务" : "重新打开任务"
				});
				renderAll();
				scheduleSave();
				if (done) toast("完成一项 · 今日进度已更新");
			}
			function deleteTask(id) {
				const task = taskOf(id);
				if (!task) return;
				if (!(typeof window.confirm === "function" ? window.confirm(`删除「${task.title}」？`) : true)) return;
				db.tasks = db.tasks.filter((t) => t.id !== id);
				if (ui.selected === id) ui.selected = chooseSelection();
				if (timer.taskId === id) timer.taskId = chooseSelection();
				renderAll();
				scheduleSave();
				toast("已删除任务");
			}
			function copyTask(id) {
				const task = taskOf(id);
				if (!task) return;
				const copy = JSON.parse(JSON.stringify(task));
				copy.id = uid("t");
				copy.title = `${task.title}（副本）`;
				copy.createdAt = nowStamp();
				copy.updatedAt = nowStamp();
				copy.completedAt = null;
				copy.status = "next";
				copy.subtasks = copy.subtasks.map((s) => ({
					...s,
					id: uid("s"),
					done: false
				}));
				copy.attachments = copy.attachments.map((a) => ({
					...a,
					id: uid("a")
				}));
				copy.logs = [{
					at: nowStamp(),
					type: "created",
					text: "复制任务"
				}];
				db.tasks.unshift(copy);
				ui.selected = copy.id;
				renderAll();
				scheduleSave();
				toast("已复制任务");
			}
			function fileKind(name) {
				const ext = name.split(".").pop()?.toLowerCase() ?? "";
				if ([
					"png",
					"jpg",
					"jpeg",
					"gif",
					"webp",
					"svg"
				].includes(ext)) return "image";
				if (ext === "pdf") return "pdf";
				if ([
					"csv",
					"tsv",
					"xls",
					"xlsx"
				].includes(ext)) return "csv";
				if ([
					"doc",
					"docx",
					"md",
					"txt"
				].includes(ext)) return "doc";
				return "file";
			}
			function openModal(html) {
				const root = $id("wb-modal");
				if (!root) return;
				root.innerHTML = `<div class="overlay" data-act="overlay"><div class="modal${/class="(?:idea|agent)-modal/.test(html) ? " modal-wide" : ""}" data-stop="1">${html}</div></div>`;
				root.querySelector("input, textarea, select")?.focus();
			}
			function closeModal() {
				const root = $id("wb-modal");
				if (root) root.innerHTML = "";
			}
			function openNewTask() {
				const spaces = db.spaces.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
				openModal(`<h3>新建任务</h3>
      <div class="mfield"><label>标题</label><input id="wb-m-title" placeholder="要做什么？"></div>
      <div class="mfield"><label>备注</label><textarea id="wb-m-desc" placeholder="补充一句上下文（可选）"></textarea></div>
      <div class="mrow"><div class="mfield"><label>项目</label><select id="wb-m-project">${[`<option value="" ${ui.project === "all" || ui.project === "none" ? "selected" : ""}>未归属</option>`, ...projectCards().map((card) => `<option value="${esc(card.path)}" ${ui.project === card.path ? "selected" : ""}>${esc(card.name)}</option>`)].join("")}</select></div>
        <div class="mfield"><label>空间</label><select id="wb-m-space">${spaces}</select></div></div>
      <div class="mrow"><div class="mfield"><label>日期</label><input id="wb-m-date" type="date" value="${todayKey()}"></div>
        <div class="mfield"><label>优先级</label><select id="wb-m-priority"><option value="normal">普通</option><option value="high">高优先级</option><option value="low">低优先级</option></select></div></div>
      <div class="mrow"><div class="mfield"><label>开始</label><input id="wb-m-start" type="time"></div>
        <div class="mfield"><label>结束</label><input id="wb-m-end" type="time"></div></div>
      <div class="mfield"><label>标签</label><input id="wb-m-tags" placeholder="用逗号分隔"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="create">创建任务</button></div>`);
			}
			function createFromModal() {
				const title = $id("wb-m-title")?.value.trim() ?? "";
				if (title === "") {
					$id("wb-m-title")?.focus();
					return;
				}
				const tags = ($id("wb-m-tags")?.value ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
				const space = $id("wb-m-space")?.value ?? "life";
				const date = $id("wb-m-date")?.value ?? todayKey();
				const start = $id("wb-m-start")?.value ?? "";
				const end = $id("wb-m-end")?.value ?? "";
				const desc = $id("wb-m-desc")?.value.trim() ?? "";
				const priority = $id("wb-m-priority")?.value ?? "normal";
				const projectPath = $id("wb-m-project")?.value ?? "";
				const task = {
					id: uid("t"),
					title,
					desc,
					note: "",
					space,
					projectPath,
					status: "next",
					priority,
					tags,
					date: date || null,
					start,
					end,
					duration: 0,
					group: "",
					createdAt: nowStamp(),
					updatedAt: nowStamp(),
					completedAt: null,
					subtasks: [],
					attachments: [],
					logs: [{
						at: nowStamp(),
						type: "created",
						text: "创建任务"
					}]
				};
				db.tasks.unshift(task);
				ui.selected = task.id;
				closeModal();
				renderAll();
				scheduleSave();
				toast("已创建任务");
			}
			function openSpace() {
				openModal(`<h3>新建空间</h3>
      <div class="mfield"><label>名称</label><input id="wb-sp-name" placeholder="例如：阅读"></div>
      <div class="mfield"><label>颜色</label><div style="display:flex;gap:7px;padding-top:3px">${ACCENTS.map((c, i) => `<button class="dot" data-act="pick-color" data-color="${c}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${i === 0 ? "var(--text)" : "transparent"};background:${c};cursor:pointer"></button>`).join("")}</div></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="create-space">创建空间</button></div>`);
				pendingColor = ACCENTS[0];
			}
			let pendingColor = ACCENTS[0];
			function createSpace() {
				const name = $id("wb-sp-name")?.value.trim() ?? "";
				if (name === "") {
					$id("wb-sp-name")?.focus();
					return;
				}
				const id = `space-${uid("")}`;
				db.spaces.push({
					id,
					name,
					color: pendingColor
				});
				closeModal();
				renderAll();
				scheduleSave();
				toast(`已创建空间「${name}」`);
			}
			async function openSettings() {
				const theme = db.settings.theme ?? "auto";
				openModal(`<h3>工作台设置</h3>
      <div class="switch-row"><span>主题</span><div class="mini-seg">${[
					"auto",
					"light",
					"dark"
				].map((t) => `<button data-act="set-theme" data-theme="${t}" class="${theme === t ? "active" : ""}">${t === "auto" ? "跟随 DSH" : t === "light" ? "浅色" : "深色"}</button>`).join("")}</div></div>
      <div class="switch-row"><span>空间</span><button class="btn" style="height:26px;padding:0 9px" data-act="manage-spaces">管理（${db.spaces.length}）</button></div>
      <div class="switch-row"><span>数据存储</span><span class="muted" style="font-size:11px" id="wb-health">读取中…</span></div>
      <div class="switch-row"><span>条目</span><span class="muted" style="font-size:11px">${db.tasks.length} 项任务 · ${db.focus.length} 次专注</span></div>
      <div class="switch-row"><span>版本</span><span class="muted" style="font-size:11px">dsh-workbench 1.5.0</span></div>
      <div class="switch-row"><span>最近 AI 提交</span><span class="muted" style="font-size:11px;max-width:320px;text-align:right;word-break:break-all">${esc(String(db.settings.lastAiError ?? "无"))}</span></div>
      <div class="mfield"><label>笔记保存目录</label>
        <input id="wb-export-dir" value="" placeholder="读取中…">
        <div class="nb-create-row" style="margin-top:6px"><button class="btn" data-act="export-dir-save">保存目录</button><button class="btn" data-act="export-dir-default">恢复默认</button></div>
        <div class="export-hint" id="wb-export-hint">另存 Markdown 与导出 PDF 都写入这里；默认是本机用户目录。</div>
      </div>
      <div class="modal-foot"><button class="btn" data-act="import">导入 JSON</button><button class="btn" data-act="export">导出 JSON</button><button class="btn solid" data-act="close-modal">完成</button></div>
      <input type="file" id="wb-import" class="attach-hidden" accept="application/json,.json">`);
				try {
					const health = await (await fetch(`${API}/health`)).json();
					const node = $id("wb-health");
					if (node) node.textContent = `${health.engine.toUpperCase()} · ${health.file} · r${health.revision}`;
				} catch {
					const node = $id("wb-health");
					if (node) node.textContent = "接口不可用";
				}
				loadExportConfig();
				const importInput = $id("wb-import");
				importInput?.addEventListener("change", () => {
					const file = importInput.files?.[0];
					if (!file) return;
					const reader = new FileReader();
					reader.onload = () => {
						try {
							const parsed = JSON.parse(String(reader.result));
							const next = parsed?.state ?? parsed;
							if (!Array.isArray(next.tasks) || !Array.isArray(next.spaces)) throw new Error("缺少 tasks/spaces");
							db = {
								spaces: next.spaces,
								tasks: next.tasks,
								focus: Array.isArray(next.focus) ? next.focus : [],
								settings: next.settings ?? db.settings
							};
							ui.selected = chooseSelection();
							closeModal();
							renderAll();
							scheduleSave();
							toast("已导入数据");
						} catch (cause) {
							toast(`导入失败：${String(cause.message)}`);
						}
					};
					reader.readAsText(file);
				});
			}
			function openField(field, id) {
				const t = taskOf(id);
				if (!t) return;
				const labels = {
					project: "项目",
					space: "空间",
					date: "日期",
					time: "时间",
					status: "执行状态",
					priority: "优先级",
					tags: "标签",
					group: "分组"
				};
				let body = "";
				if (field === "project") body = `<div class="mfield"><label>项目（= DSH 工作区）</label><select id="wb-f-project">${[`<option value="" ${t.projectPath === "" ? "selected" : ""}>未归属</option>`, ...projectCards().map((card) => `<option value="${esc(card.path)}" ${t.projectPath === card.path ? "selected" : ""}>${esc(card.name)}</option>`)].join("")}</select></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px">选择项目后，任务会出现在该项目的日历、统计与门户计数里。</div>`;
				else if (field === "space") body = `<div class="mfield"><label>空间</label><select id="wb-f-space">${db.spaces.map((sp) => `<option value="${sp.id}" ${sp.id === t.space ? "selected" : ""}>${esc(sp.name)}</option>`).join("")}</select></div>`;
				else if (field === "date") body = `<div class="mfield"><label>日期（留空表示不安排）</label><input id="wb-f-date" type="date" value="${t.date ?? ""}"></div>`;
				else if (field === "time") body = `<div class="mrow"><div class="mfield"><label>开始</label><input id="wb-f-start" type="time" value="${t.start}"></div><div class="mfield"><label>结束</label><input id="wb-f-end" type="time" value="${t.end}"></div></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px">时长会按开始 / 结束自动计算；只填开始也可以。</div>`;
				else if (field === "status") body = `<div class="mfield"><label>执行状态</label><select id="wb-f-status">${[
					"next",
					"doing",
					"waiting",
					"done"
				].map((st) => `<option value="${st}" ${st === t.status ? "selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}</select></div>`;
				else if (field === "priority") body = `<div class="mfield"><label>优先级</label><select id="wb-f-priority">${[
					"high",
					"normal",
					"low"
				].map((p) => `<option value="${p}" ${p === t.priority ? "selected" : ""}>${PRIORITY_LABEL[p]}</option>`).join("")}</select></div>`;
				else if (field === "tags") body = `<div class="mfield"><label>标签（用逗号分隔）</label><input id="wb-f-tags" value="${esc(t.tags.join(", "))}" placeholder="例如：个人学习, 周会"></div>`;
				else body = `<div class="mfield"><label>分组</label><input id="wb-f-group" value="${esc(t.group)}" placeholder="例如：Excel 学习"></div>`;
				openModal(`<h3>编辑${labels[field] ?? "任务"}</h3>${body}
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-field" data-field="${field}" data-id="${id}">保存</button></div>`);
			}
			function applyField(field, id) {
				const t = taskOf(id);
				if (!t) return;
				({ ...t });
				if (field === "project") t.projectPath = $id("wb-f-project")?.value ?? "";
				else if (field === "space") t.space = $id("wb-f-space")?.value ?? t.space;
				else if (field === "date") t.date = $id("wb-f-date")?.value || null;
				else if (field === "time") {
					t.start = $id("wb-f-start")?.value ?? "";
					t.end = $id("wb-f-end")?.value ?? "";
					const toMin = (v) => {
						const [h, m] = v.split(":").map(Number);
						return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
					};
					const span = toMin(t.end) - toMin(t.start);
					t.duration = t.start !== "" && t.end !== "" && span > 0 ? span : 0;
				} else if (field === "status") {
					const next = $id("wb-f-status")?.value ?? "next";
					t.status = next;
					if (next === "done") t.completedAt = nowStamp();
					else t.completedAt = null;
				} else if (field === "priority") t.priority = $id("wb-f-priority")?.value ?? "normal";
				else if (field === "tags") t.tags = ($id("wb-f-tags")?.value ?? "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
				else if (field === "group") t.group = ($id("wb-f-group")?.value ?? "").trim();
				t.updatedAt = nowStamp();
				t.logs.unshift({
					at: nowStamp(),
					type: "edit",
					text: `修改${field === "project" ? "项目" : field === "space" ? "空间" : field === "date" ? "日期" : field === "time" ? "时间" : field === "status" ? "执行状态" : field === "priority" ? "优先级" : field === "tags" ? "标签" : "分组"}`
				});
				closeModal();
				renderAll();
				scheduleSave();
				toast("已更新");
			}
			function toLocalInput(value) {
				if (!value) return "";
				const short = value.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
				if (short) return `${(/* @__PURE__ */ new Date()).getFullYear()}-${short[1]}-${short[2]}T${short[3]}:${short[4]}`;
				if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) return value.replace(" ", "T").slice(0, 16);
				if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;
				return "";
			}
			function fromLocalInput(value) {
				return value ? value.replace("T", " ").slice(0, 16) : "";
			}
			function openSubPlan(id, sid) {
				const task = taskOf(id);
				const sub = task?.subtasks.find((s) => s.id === sid);
				if (!task || !sub) return;
				openModal(`<h3>子待办计划时间</h3>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px">${esc(sub.title)}</div>
      <div class="mrow"><div class="mfield"><label>计划开始</label><input id="wb-s-start" type="datetime-local" value="${toLocalInput(sub.start)}"></div>
      <div class="mfield"><label>计划完成</label><input id="wb-s-end" type="datetime-local" value="${toLocalInput(sub.end)}"></div></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-sub-plan" data-id="${id}" data-sid="${sid}">保存</button></div>`);
			}
			function applySubPlan(id, sid) {
				const task = taskOf(id);
				const sub = task?.subtasks.find((s) => s.id === sid);
				if (!task || !sub) return;
				sub.start = fromLocalInput($id("wb-s-start")?.value ?? "");
				sub.end = fromLocalInput($id("wb-s-end")?.value ?? "");
				task.updatedAt = nowStamp();
				task.logs.unshift({
					at: nowStamp(),
					type: "edit",
					text: `修改子待办「${sub.title}」计划时间`
				});
				closeModal();
				renderAll();
				scheduleSave();
				toast("子待办时间已更新");
			}
			function openSpaces() {
				openModal(`<h3>空间管理</h3>
      <div style="margin:2px 0 8px">${db.spaces.map((sp) => `<div class="next-item" style="padding:8px 4px;gap:8px">
        <span class="dot" style="background:${sp.color}"></span>
        <input data-space-name="${sp.id}" value="${esc(sp.name)}" style="flex:1;min-width:0;height:28px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text);font:11.5px var(--font);padding:0 7px;outline:0">
        <input type="color" data-space-color="${sp.id}" value="${sp.color}" title="空间颜色" style="width:24px;height:24px;border:0;background:none;padding:0;cursor:pointer">
        <button class="btn" style="height:28px;padding:0 8px" data-act="del-space" data-id="${sp.id}">删除</button>
      </div>`).join("")}</div>
      <div class="modal-foot"><button class="btn" data-act="space-add">新建空间</button><button class="btn solid" data-act="close-modal">完成</button></div>`);
				shadow.querySelectorAll("[data-space-name]").forEach((input) => {
					input.addEventListener("blur", () => {
						const sp = db.spaces.find((x) => x.id === input.getAttribute("data-space-name"));
						if (sp && input.value.trim() !== "" && sp.name !== input.value.trim()) {
							sp.name = input.value.trim();
							scheduleSave();
							renderAll();
							toast("空间已改名");
						}
					});
				});
				shadow.querySelectorAll("[data-space-color]").forEach((input) => {
					input.addEventListener("change", () => {
						const sp = db.spaces.find((x) => x.id === input.getAttribute("data-space-color"));
						if (sp && input.value !== sp.color) {
							sp.color = input.value;
							scheduleSave();
							renderAll();
							toast("空间颜色已更新");
						}
					});
				});
			}
			function openThemeMenu() {
				const current = db.settings.theme ?? "auto";
				openModal(`<h3>主题</h3>
      <div style="margin:2px 0 8px">${[
					[
						"auto",
						"跟随 DSH",
						"MOSS / opencode-palette 等皮肤切换时自动同步"
					],
					[
						"light",
						"浅色",
						"固定使用工作台自带浅色"
					],
					[
						"dark",
						"深色",
						"固定使用工作台自带深色"
					]
				].map(([key, label, desc]) => `<div class="next-item" data-act="set-theme" data-theme="${key}" style="padding:9px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${current === key ? "var(--accent)" : "var(--text-3)"}">${current === key ? "✓" : ""}</span>
        <span style="flex:1"><b style="font-size:12px">${label}</b><span style="display:block;color:var(--text-3);font-size:10.5px">${desc}</span></span>
      </div>`).join("")}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`);
			}
			function openFilter() {
				openModal(`<h3>筛选任务</h3>
      <div style="margin:2px 0 8px">${[
					[
						"all",
						"全部任务",
						"不筛选"
					],
					[
						"high",
						"高优先级",
						"只留下优先级为高的任务"
					],
					[
						"sub",
						"有子待办",
						"已经拆过步骤的任务"
					],
					[
						"attach",
						"有附件",
						"带文件或图片的任务"
					],
					[
						"unscheduled",
						"未排时间",
						"还没填开始时间的任务"
					]
				].map(([key, label, desc]) => `<div class="next-item" data-act="set-filter" data-filter="${key}" style="padding:8px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${ui.filter === key ? "var(--accent)" : "var(--text-3)"}">${ui.filter === key ? "✓" : ""}</span>
        <span style="flex:1"><b style="font-size:12px">${label}</b><span style="display:block;color:var(--text-3);font-size:10.5px">${desc}</span></span>
      </div>`).join("")}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`);
			}
			function openSort() {
				openModal(`<h3>排序方式</h3>
      <div style="margin:2px 0 8px">${[
					["time", "按时间"],
					["priority", "按优先级"],
					["created", "按创建时间"],
					["title", "按标题"]
				].map(([key, label]) => `<div class="next-item" data-act="set-sort" data-sort="${key}" style="padding:9px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${ui.sort === key ? "var(--accent)" : "var(--text-3)"}">${ui.sort === key ? "✓" : ""}</span><span>${label}</span></div>`).join("")}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`);
			}
			function openNotifications() {
				const today = todayKey();
				const done = db.tasks.filter((t) => t.date === today && t.status === "done");
				const waiting = db.tasks.filter((t) => t.status === "waiting");
				const overdue = db.tasks.filter((t) => t.status !== "done" && t.date !== null && t.date < today);
				const item = (t) => `<div class="next-item" data-id="${t.id}"><span class="t">${t.start || "--:--"}</span><span style="flex:1">${esc(t.title)}</span><span class="muted" style="font-size:10px">${esc(spaceOf(t.space).name)}</span></div>`;
				openModal(`<h3>通知</h3>
      <div class="d-sec"><div class="d-sec-h">${ic("check", 11)} 今天已完成 · ${done.length}</div>${done.map(item).join("") || "<div class=\"muted\" style=\"font-size:11px\">还没有完成的任务</div>"}</div>
      <div class="d-sec"><div class="d-sec-h">${ic("clock", 11)} 等待中 · ${waiting.length}</div>${waiting.map(item).join("") || "<div class=\"muted\" style=\"font-size:11px\">没有等待中的任务</div>"}</div>
      <div class="d-sec"><div class="d-sec-h">${ic("flag", 11)} 已过期 · ${overdue.length}</div>${overdue.map(item).join("") || "<div class=\"muted\" style=\"font-size:11px\">没有过期任务</div>"}</div>
      <div class="modal-foot"><button class="btn solid" data-act="close-modal">知道了</button></div>`);
			}
			function openCustomTimer() {
				openModal(`<h3>自定义专注时长</h3>
      <div class="mfield"><label>分钟（1–180）</label><input id="wb-timer-min" type="number" min="1" max="180" value="${timer.preset}"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px">计时结束会写入一条专注记录，并累计到今日专注。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-timer">使用该时长</button></div>`);
			}
			function applyCustomTimer() {
				const raw = Number($id("wb-timer-min")?.value ?? 25);
				const minutes = Math.max(1, Math.min(180, Math.round(Number.isFinite(raw) && raw > 0 ? raw : 25)));
				timer.preset = minutes;
				timer.remaining = minutes * 60;
				timer.running = false;
				timer.endsAt = 0;
				closeModal();
				renderContent();
				toast(`已设为 ${minutes} 分钟`);
			}
			function exportData() {
				const a = document.createElement("a");
				a.href = `${API}/export`;
				a.download = "dsh-workbench.json";
				a.click();
			}
			let toastTimer = 0;
			function toast(message) {
				const el = $id("wb-toast");
				if (!el) return;
				el.textContent = message;
				el.classList.add("show");
				if (toastTimer !== 0) window.clearTimeout(toastTimer);
				toastTimer = window.setTimeout(() => el.classList.remove("show"), 1700);
			}
			function onClick(event) {
				const target = event.target;
				if (!target) return;
				if (ctxMenuOpen && target.closest("#wb-ctxmenu") === null) closeContextMenu();
				const actEl = target.closest("[data-act]");
				if (actEl) {
					const act = actEl.getAttribute("data-act") ?? "";
					const id = actEl.getAttribute("data-id") ?? "";
					if (act === "overlay") {
						if (target === actEl) closeModal();
						return;
					}
					if (act === "close-modal") {
						closeModal();
						return;
					}
					if (act === "portal-home") {
						openPortal();
						return;
					}
					if (act === "portal-project") {
						setProject(actEl.getAttribute("data-id") ?? "all");
						return;
					}
					if (act === "portal-open") {
						openFeature(actEl.getAttribute("data-view") ?? "list");
						return;
					}
					if (act === "portal-enter") {
						setProject(actEl.getAttribute("data-id") ?? "all", false);
						openFeature(actEl.getAttribute("data-view") ?? "list");
						return;
					}
					if (act === "portal-new") {
						openProductEdit(void 0, actEl.getAttribute("data-path") ?? void 0);
						return;
					}
					if (act === "portal-edit") {
						openProductEdit(actEl.getAttribute("data-id") ?? void 0);
						return;
					}
					if (act === "portal-delete") {
						deleteProduct(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "portal-load") {
						refreshPortal().then(() => toast("项目数据已刷新"));
						return;
					}
					if (act === "agent-team-open") {
						agentPanel.openTeam(id);
						return;
					}
					if (act === "agent-team-new") {
						agentPanel.openTeamForm();
						return;
					}
					if (act === "agent-team-edit") {
						const team = agentPanel.teams().find((item) => item.id === id);
						if (team !== void 0) agentPanel.openTeamForm(team);
						return;
					}
					if (act === "agent-team-save") {
						agentPanel.createTeam();
						return;
					}
					if (act === "agent-team-delete") {
						agentPanel.deleteTeam(id);
						return;
					}
					if (act === "agent-member-new") {
						agentPanel.openMemberForm(actEl.getAttribute("data-team") ?? "");
						return;
					}
					if (act === "agent-member-edit") {
						const member = agentPanel.members().find((item) => item.id === id);
						if (member !== void 0) agentPanel.openMemberForm(actEl.getAttribute("data-team") ?? "", member);
						return;
					}
					if (act === "agent-member-save") {
						agentPanel.saveMember(actEl.getAttribute("data-team") ?? "", id);
						return;
					}
					if (act === "agent-member-del") {
						agentPanel.removeMember(actEl.getAttribute("data-team") ?? "", id);
						return;
					}
					if (act === "agent-member-write") {
						agentPanel.toggleWrite(actEl.getAttribute("data-team") ?? "", id);
						return;
					}
					if (act === "agent-member-add") {
						agentPanel.addMemberToTeam(actEl.getAttribute("data-team") ?? "");
						return;
					}
					if (act === "agent-close") {
						closeModal();
						return;
					}
					if (act === "agent-toggle-option") {
						agentPanel.toggleOption(actEl.getAttribute("data-field") ?? "", actEl.getAttribute("data-value") ?? "");
						return;
					}
					if (act === "agent-binding-toggle") {
						agentPanel.toggleBinding(actEl.getAttribute("data-team") ?? "", actEl.getAttribute("data-feature") ?? "", actEl.getAttribute("data-member") ?? "");
						return;
					}
					if (act === "agent-refresh-catalog") {
						agentPanel.loadCatalog().then(() => agentPanel.openMemberForm(actEl.getAttribute("data-team") ?? ""));
						return;
					}
					if (act === "agent-memory-open") {
						agentPanel.openMemoryModal();
						return;
					}
					if (act === "agent-memory-add") {
						agentPanel.addMemory();
						return;
					}
					if (act === "agent-memory-del") {
						agentPanel.deleteMemory(id);
						return;
					}
					if (act === "agent-knowledge-open") {
						agentPanel.openKnowledgeModal();
						return;
					}
					if (act === "agent-knowledge-index") {
						agentPanel.indexKnowledge();
						return;
					}
					if (act === "agent-knowledge-search") {
						agentPanel.searchKnowledge();
						return;
					}
					if (act === "new") {
						openNewTask();
						return;
					}
					if (act === "settings") {
						openSettings();
						return;
					}
					if (act === "space-add") {
						openSpace();
						return;
					}
					if (act === "create-space") {
						createSpace();
						return;
					}
					if (act === "pick-color") {
						pendingColor = actEl.getAttribute("data-color") ?? ACCENTS[0];
						shadow.querySelectorAll("[data-act=\"pick-color\"]").forEach((node) => {
							node.style.borderColor = node === actEl ? "var(--text)" : "transparent";
						});
						return;
					}
					if (act === "theme") {
						openThemeMenu();
						return;
					}
					if (act === "set-theme") {
						const inSettings = ($id("wb-modal")?.innerHTML ?? "").includes("工作台设置");
						db.settings.theme = actEl.getAttribute("data-theme") ?? "auto";
						renderAll();
						scheduleSave();
						if (inSettings) openSettings();
						else closeModal();
						toast((db.settings.theme ?? "auto") === "auto" ? "已跟随 DSH 主题" : "已切换工作台主题");
						return;
					}
					if (act === "collapse") {
						collapseTouched = true;
						ui.collapsed = !ui.collapsed;
						renderAll();
						return;
					}
					if (act === "retry") {
						boot();
						return;
					}
					if (act === "create") {
						createFromModal();
						return;
					}
					if (act === "delete") {
						deleteTask(id);
						return;
					}
					if (act === "copy") {
						copyTask(id);
						return;
					}
					if (act === "refresh") {
						reloadFromServer();
						return;
					}
					if (act === "focus-title") {
						shadow.querySelector("[data-edit-title]")?.focus();
						return;
					}
					if (act === "toggle") {
						toggleDone(id);
						return;
					}
					if (act === "toggle-sub") {
						const task = taskOf(id);
						const sub = task?.subtasks.find((s) => s.id === actEl.getAttribute("data-sid"));
						if (task && sub) {
							sub.done = !sub.done;
							task.updatedAt = nowStamp();
							renderAll();
							scheduleSave();
						}
						return;
					}
					if (act === "tab") {
						ui.detailTab = actEl.getAttribute("data-tab") ?? "detail";
						renderDetail();
						return;
					}
					if (act === "preset") {
						const n = Number(actEl.getAttribute("data-n") ?? 25);
						timer.preset = n;
						timer.remaining = n * 60;
						timer.running = false;
						timer.endsAt = 0;
						renderContent();
						return;
					}
					if (act === "toggle-timer") {
						if (timer.running) {
							timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1e3));
							timer.running = false;
							timer.endsAt = 0;
						} else {
							timer.endsAt = Date.now() + timer.remaining * 1e3;
							timer.running = true;
						}
						renderContent();
						return;
					}
					if (act === "reset") {
						timer.running = false;
						timer.endsAt = 0;
						timer.remaining = timer.preset * 60;
						renderContent();
						return;
					}
					if (act === "queue") {
						if (timer.running) {
							toast("计时中，先暂停再切换任务");
							return;
						}
						timer.taskId = actEl.getAttribute("data-id");
						renderContent();
						return;
					}
					if (act === "focus-expand") {
						ui.focusExpand = !ui.focusExpand;
						renderAll();
						return;
					}
					if (act === "cal-mode") {
						ui.calendarMode = actEl.getAttribute("data-mode") ?? "week";
						renderContent();
						return;
					}
					if (act === "cal-prev" || act === "cal-next") {
						const dir = act === "cal-prev" ? -1 : 1;
						ui.calendarAnchor = ui.calendarMode === "week" ? addDays(ui.calendarAnchor, dir * 7) : ui.calendarMode === "month" ? addMonths(ui.calendarAnchor, dir) : addMonths(ui.calendarAnchor, dir * 12);
						renderContent();
						return;
					}
					if (act === "cal-day") {
						ui.calendarAnchor = actEl.getAttribute("data-day") ?? todayKey();
						ui.calendarMode = "week";
						renderContent();
						return;
					}
					if (act === "cal-month") {
						ui.calendarAnchor = actEl.getAttribute("data-month") ?? todayKey();
						ui.calendarMode = "month";
						renderContent();
						return;
					}
					if (act === "del-attach") {
						const task = taskOf(id);
						const aid = actEl.getAttribute("data-aid") ?? "";
						if (task) {
							task.attachments = task.attachments.filter((a) => a.id !== aid);
							renderAll();
							scheduleSave();
						}
						return;
					}
					if (act === "pick-file" || act === "pick-image") {
						const input = $id("wb-file");
						if (input) {
							input.accept = act === "pick-image" ? "image/*" : "";
							input.click();
						}
						return;
					}
					if (act === "import") {
						$id("wb-import")?.click();
						return;
					}
					if (act === "export") {
						exportData();
						return;
					}
					if (act === "notify") {
						openNotifications();
						return;
					}
					if (act === "filter") {
						openFilter();
						return;
					}
					if (act === "sort") {
						openSort();
						return;
					}
					if (act === "set-filter") {
						ui.filter = actEl.getAttribute("data-filter") ?? "all";
						closeModal();
						renderAll();
						return;
					}
					if (act === "set-sort") {
						ui.sort = actEl.getAttribute("data-sort") ?? "time";
						closeModal();
						renderAll();
						return;
					}
					if (act === "density") {
						ui.compact = !ui.compact;
						db.settings.compact = ui.compact;
						renderAll();
						scheduleSave();
						toast(ui.compact ? "紧凑视图" : "标准视图");
						return;
					}
					if (act === "test-pick") {
						testProjectSelected = actEl.getAttribute("data-id") ?? "";
						testRunSelected = null;
						testTab = "cases";
						renderContent();
						return;
					}
					if (act === "test-new") {
						openTestProject();
						return;
					}
					if (act === "test-edit") {
						openTestProject(testProjectSelected ?? void 0);
						return;
					}
					if (act === "test-save") {
						saveTestProject(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "test-delete") {
						deleteTestProject(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "test-refresh") {
						loadTests();
						return;
					}
					if (act === "test-tab") {
						testTab = actEl.getAttribute("data-tab") ?? "cases";
						renderContent();
						return;
					}
					if (act === "test-gen") {
						openTestGen();
						return;
					}
					if (act === "test-exec") {
						openTestExecDispatch();
						return;
					}
					if (act === "test-exec-run") {
						const target = $id("wb-dispatch-target")?.value ?? "";
						const prompt = $id("wb-dispatch-prompt")?.value.trim() ?? "";
						const run = testRunOf(actEl.getAttribute("data-run") ?? "");
						const project = testProjectOf(testProjectSelected);
						if (prompt === "" || !run || !project) return;
						closeModal();
						(async () => {
							try {
								await navigator.clipboard.writeText(prompt);
							} catch {}
							if (target !== "") try {
								await appendToExistingSession(target, prompt);
								toast("已追加到已有会话");
								return;
							} catch (cause) {
								toast(`追加失败，已复制提示词：${String(cause.message ?? cause)}`);
								return;
							}
							try {
								await queueTestExec(project, run);
							} catch (cause) {
								toast(`提交失败：${String(cause.message ?? cause)}`);
							}
						})();
						return;
					}
					if (act === "test-gen-run") {
						runTestGen();
						return;
					}
					if (act === "test-case-delete") {
						deleteTestCase(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "test-start") {
						startTestRun();
						return;
					}
					if (act === "test-result") {
						updateTestResult(actEl.getAttribute("data-run") ?? "", actEl.getAttribute("data-case") ?? "", actEl.getAttribute("data-status") ?? "pending");
						return;
					}
					if (act === "test-bug") {
						createBugFromTest(actEl.getAttribute("data-run") ?? "", actEl.getAttribute("data-case") ?? "");
						return;
					}
					if (act === "test-finish") {
						finishTestRun(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "test-regression") {
						regressionRun();
						return;
					}
					if (act === "test-report-save") {
						saveTestReport();
						return;
					}
					if (act === "test-deploy") {
						deployTestProject();
						return;
					}
					if (act === "product-pick") {
						const id = actEl.getAttribute("data-id") ?? "";
						if (productPicked.has(id)) productPicked.delete(id);
						else productPicked.add(id);
						renderContent();
						return;
					}
					if (act === "product-select") {
						productSelected = actEl.getAttribute("data-id") ?? null;
						productNodeSelected = null;
						productDemoSelected = "";
						productPicked = productDefaultPicked(productOf(productSelected));
						renderContent();
						return;
					}
					if (act === "product-new") {
						openProductEdit();
						return;
					}
					if (act === "product-edit") {
						openProductEdit(productSelected ?? void 0);
						return;
					}
					if (act === "product-save") {
						saveProduct(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "product-delete") {
						deleteProduct(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "product-tab") {
						productTab = actEl.getAttribute("data-tab") ?? "map";
						renderContent();
						return;
					}
					if (act === "product-refresh") {
						loadProducts();
						return;
					}
					if (act === "product-node-new") {
						openNodeQuickAdd("child", actEl.getAttribute("data-type") ?? "feature");
						return;
					}
					if (act === "product-node-child") {
						openNodeQuickAdd("child");
						return;
					}
					if (act === "product-node-sibling") {
						openNodeQuickAdd("sibling");
						return;
					}
					if (act === "product-node-add-quick") {
						saveQuickNode();
						return;
					}
					if (act === "pm-map-new") {
						openMapEditor();
						return;
					}
					if (act === "pm-map-rename") {
						openMapEditor(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-map-save") {
						saveMapFromModal(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-map-delete") {
						deleteMapById(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-map-select") {
						selectMap(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-engine") {
						productMapEngine = actEl.getAttribute("data-mode") === "force" ? "force" : "tree";
						productMapPreview = null;
						renderContent();
						return;
					}
					if (act === "pm-toggle-fold") {
						toggleNodeFold(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-node-kind") {
						changeNodeKind(actEl.getAttribute("data-id") ?? "", actEl.getAttribute("data-kind") ?? "feature");
						return;
					}
					if (act === "pm-node-relate") {
						openRelateModal(actEl.getAttribute("data-id") ?? productNodeSelected ?? "", false);
						return;
					}
					if (act === "pm-node-relate-ext") {
						openRelateModal(actEl.getAttribute("data-id") ?? productNodeSelected ?? "", true);
						return;
					}
					if (act === "pm-relate-save") {
						saveRelate(actEl.getAttribute("data-id") ?? "", actEl.getAttribute("data-ext") === "1");
						return;
					}
					if (act === "pm-export-outline") {
						exportMindmapOutline();
						return;
					}
					if (act === "pm-import-outline") {
						importMindmapOutline();
						return;
					}
					if (act === "pm-import-run") {
						runMindmapImport();
						return;
					}
					if (act === "pm-import-idea") {
						openIdeaImport();
						return;
					}
					if (act === "idea-import-next") {
						openIdeaVersionPick();
						return;
					}
					if (act === "idea-import-run") {
						runIdeaImport(actEl.getAttribute("data-idea") ?? "", actEl.getAttribute("data-name") ?? "");
						return;
					}
					if (act === "pm-version-archive") {
						archiveMapVersion();
						return;
					}
					if (act === "pm-version-preview") {
						previewMapVersion(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-version-rollback") {
						rollbackMapVersion(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-version-delete") {
						removeMapVersion(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "pm-version-back") {
						productMapPreview = null;
						renderContent();
						return;
					}
					if (act === "pm-version-diff") {
						openMapVersionDiff();
						return;
					}
					if (act === "pm-version-diff-run") {
						runMapVersionDiff();
						return;
					}
					if (act === "product-node-edit") {
						openNodeProperty();
						return;
					}
					if (act === "product-node-update") {
						updateProductNode(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "product-node-delete") {
						deleteProductNode();
						return;
					}
					if (act === "product-gen-notes") {
						generateProductNotes();
						return;
					}
					if (act === "product-gen-modules") {
						generateProductModules();
						return;
					}
					if (act === "product-demo-delete") {
						deleteProductDemo(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "product-note-open") {
						const nid = actEl.getAttribute("data-id") ?? "";
						closeModal();
						openProductNote(nid);
						return;
					}
					if (act === "product-module-detail") {
						openModuleDetail(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "flow-gen-tests") {
						const product = productOf(productSelected);
						if (!product) return;
						ui.view = "test";
						renderAll();
						loadTests(true).then(() => {
							const project = testProjects.find((p) => p.productId === product.id) ?? testProjectOf(testProjectSelected);
							if (project) {
								testProjectSelected = project.id;
								testGenSource = "notes";
								testGenRequirement = `基于产品「${product.name}」的设计笔记生成测试用例`;
								openTestGen();
							} else {
								toast("先创建测试项目并关联该产品，再生成用例");
								openTestProject();
							}
						});
						return;
					}
					if (act === "bug-regression") {
						ui.view = "test";
						testTab = "run";
						renderAll();
						loadTests(true).then(() => {
							toast("在「执行」页点「回归失败用例」验证修复");
						});
						return;
					}
					if (act === "cmd") {
						openCommandPalette();
						return;
					}
					if (act === "cmd-go") {
						const view = actEl.getAttribute("data-view") ?? "";
						const action = actEl.getAttribute("data-action") ?? "";
						closeModal();
						if (view !== "") {
							ui.view = view;
							ui.selected = null;
							renderAll();
							return;
						}
						if (action === "new") {
							openNewTask();
							return;
						}
						if (action === "note-new") {
							ui.view = "notes";
							renderAll();
							window.setTimeout(() => {
								createNote();
							}, 0);
							return;
						}
						if (action === "bug-new") {
							ui.view = "bugs";
							renderAll();
							window.setTimeout(() => openBugEditor(), 0);
							return;
						}
						if (action === "product-new") {
							ui.view = "product";
							renderAll();
							window.setTimeout(() => openProductEdit(), 0);
							return;
						}
						if (action === "test-new") {
							ui.view = "test";
							renderAll();
							window.setTimeout(() => openTestProject(), 0);
							return;
						}
						if (action === "theme") {
							openThemeMenu();
							return;
						}
						if (action === "settings") {
							openSettings();
							return;
						}
						return;
					}
					if (act === "ai-dispatch") {
						openAiDispatch(actEl.getAttribute("data-kind") ?? "product");
						return;
					}
					if (act === "ai-dispatch-run") {
						runAiDispatch(actEl.getAttribute("data-kind") ?? "product");
						return;
					}
					if (act === "product-gen-demo") {
						generateProductDemo(actEl.getAttribute("data-scope") ?? "all");
						return;
					}
					if (act === "product-gen-demo-ai") {
						generateDemoViaAI();
						return;
					}
					if (act === "demo-viewport") {
						demoViewport = actEl.getAttribute("data-v") ?? "pc";
						renderContent();
						return;
					}
					if (act === "demo-progress-clear") {
						demoProgressDismissedAt = demoProgress?.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
						renderContent();
						return;
					}
					if (act === "bug-project") {
						bugProjectFilter = actEl.getAttribute("data-id") ?? "all";
						bugSelected.clear();
						renderContent();
						return;
					}
					if (act === "bug-project-new") {
						openBugProject();
						return;
					}
					if (act === "bug-project-manage") {
						openBugProjectManager();
						return;
					}
					if (act === "bug-project-edit") {
						openBugProject(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-project-delete") {
						deleteBugProject(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-project-save") {
						saveBugProject(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-new") {
						openBugEditor(void 0, actEl.getAttribute("data-status") ?? "open");
						return;
					}
					if (act === "bug-save") {
						saveBug(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-detail") {
						openBugDetail(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-edit") {
						openBugEditor(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-delete") {
						deleteBug(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "bug-status") {
						setBugStatus(actEl.getAttribute("data-id") ?? "", actEl.getAttribute("data-status") ?? "open");
						return;
					}
					if (act === "bug-ai-submit") {
						submitBugsToAI([actEl.getAttribute("data-id") ?? ""]);
						return;
					}
					if (act === "bug-ai-dispatch") {
						const bug = bugOf(actEl.getAttribute("data-id") ?? "");
						if (bug) {
							closeModal();
							bugSelected = /* @__PURE__ */ new Set([bug.id]);
							openAiDispatch("bug", bugPrompt([bug]));
						}
						return;
					}
					if (act === "note-ai-dispatch") {
						const note = noteById(noteSelected);
						if (note) openAiDispatch("note", noteImprovePrompt(note, ""));
						return;
					}
					if (act === "bug-goto-session") {
						const sid = actEl.getAttribute("data-id") ?? "";
						const row = Array.from(document.querySelectorAll("[data-row-key^=\"session:\"],[data-session-id]")).find((el) => (el.getAttribute("data-row-key") ?? el.getAttribute("data-session-id") ?? "").includes(sid));
						if (row !== void 0) {
							closeModal();
							row.click();
							toast("已跳转到修复会话");
						} else toast("未在侧栏找到该会话，可能已归档");
						return;
					}
					if (act === "bug-select") {
						const id = actEl.getAttribute("data-id") ?? "";
						if (bugSelected.has(id)) bugSelected.delete(id);
						else bugSelected.add(id);
						refreshBugMain();
						return;
					}
					if (act === "bug-select-clear") {
						bugSelected.clear();
						refreshBugMain();
						return;
					}
					if (act === "bug-submit-selected") {
						submitBugsToAI(Array.from(bugSelected));
						return;
					}
					if (act === "bug-plan-selected") {
						planSelectedBugs();
						return;
					}
					if (act === "bug-plan-save") {
						saveBugPlan();
						return;
					}
					if (act === "bug-plan-submit") {
						submitPlannedBugs();
						return;
					}
					if (act === "bug-refresh") {
						loadBugs();
						return;
					}
					if (act === "note-new") {
						createNote();
						return;
					}
					if (act === "note-ai-improve") {
						if (noteById(noteSelected)) {
							if (typeof window.confirm === "function" ? window.confirm("AI 将新建会话并修改这篇笔记，继续？") : true) improveSelectedNote("");
						}
						return;
					}
					if (act === "note-ai-requirements") {
						openNoteRequirements();
						return;
					}
					if (act === "note-ai-run") {
						const req = $id("wb-note-req")?.value ?? "";
						closeModal();
						improveSelectedNote(req);
						return;
					}
					if (act === "note-save") {
						flushNoteSave();
						return;
					}
					if (act === "note-saveas") {
						exportSelectedNote("md");
						return;
					}
					if (act === "note-pdf") {
						exportSelectedNote("pdf");
						return;
					}
					if (act === "open-export-folder") {
						openExportFolder();
						return;
					}
					if (act === "copy-export-path") {
						copyExportPath();
						return;
					}
					if (act === "notebook-new") {
						openNotebookCreate();
						return;
					}
					if (act === "notebook-manage") {
						openNotebookManager();
						return;
					}
					if (act === "nb-create") {
						createNotebook();
						return;
					}
					if (act === "nb-rename") {
						openNotebookRename(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "nb-rename-save") {
						renameNotebook(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "nb-delete") {
						deleteNotebook(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "export-dir-save") {
						saveExportDir($id("wb-export-dir")?.value ?? "");
						return;
					}
					if (act === "export-dir-default") {
						saveExportDir(defaultExportDir);
						return;
					}
					if (act === "note-delete") {
						deleteSelectedNote();
						return;
					}
					if (act === "note-pin") {
						toggleSelectedPin();
						return;
					}
					if (act === "note-convert") {
						convertNoteToTask();
						return;
					}
					if (act === "note-retry") {
						loadNotes();
						return;
					}
					if (act === "note-tab") {
						ui.noteMode = actEl.getAttribute("data-mode") ?? "edit";
						renderContent();
						return;
					}
					if (act === "note-filter") {
						ui.notesFilter = actEl.getAttribute("data-filter") ?? "all";
						renderContent();
						return;
					}
					if (act === "news-add") {
						openNewsTopic();
						return;
					}
					if (act === "news-preset") {
						const preset = NEWS_PRESETS[Number(actEl.getAttribute("data-index") ?? 0)];
						if (preset) openNewsTopic(void 0, preset);
						return;
					}
					if (act === "news-edit") {
						const topic = newsTopics.find((t) => t.id === id);
						if (topic) openNewsTopic(topic);
						return;
					}
					if (act === "news-save") {
						saveNewsFromModal(actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "news-run") {
						runNewsTopic(id);
						return;
					}
					if (act === "news-toggle") {
						toggleNewsTopic(id);
						return;
					}
					if (act === "news-delete") {
						deleteNewsTopic(id);
						return;
					}
					if (act === "news-refresh") {
						loadNews();
						return;
					}
					if (act === "news-filter") {
						ui.newsTopicFilter = actEl.getAttribute("data-topic") ?? "all";
						renderContent();
						return;
					}
					if (act === "edit-field") {
						openField(actEl.getAttribute("data-field") ?? "", id);
						return;
					}
					if (act === "apply-field") {
						applyField(actEl.getAttribute("data-field") ?? "", actEl.getAttribute("data-id") ?? "");
						return;
					}
					if (act === "manage-spaces") {
						openSpaces();
						return;
					}
					if (act === "sub-plan") {
						openSubPlan(id, actEl.getAttribute("data-sid") ?? "");
						return;
					}
					if (act === "apply-sub-plan") {
						applySubPlan(id, actEl.getAttribute("data-sid") ?? "");
						return;
					}
					if (act === "del-space") {
						const sp = db.spaces.find((x) => x.id === id);
						if (!sp) return;
						const used = db.tasks.filter((t) => t.space === id);
						if (used.length > 0) {
							toast(`「${sp.name}」还有 ${used.length} 项任务，先移动任务再删除`);
							return;
						}
						db.spaces = db.spaces.filter((x) => x.id !== id);
						if (ui.space === id) ui.space = "all";
						scheduleSave();
						renderAll();
						openSpaces();
						toast("空间已删除");
						return;
					}
					if (act === "review") {
						ui.view = "stats";
						ui.statsPeriod = "month";
						renderAll();
						return;
					}
					if (act === "stats-period") {
						ui.statsPeriod = actEl.getAttribute("data-period") ?? "week";
						renderAll();
						return;
					}
					if (act === "custom-timer") {
						openCustomTimer();
						return;
					}
					if (act === "apply-timer") {
						applyCustomTimer();
						return;
					}
					if (act === "sub-note") {
						const sid = actEl.getAttribute("data-sid") ?? "";
						ui.subNoteId = ui.subNoteId === sid ? null : sid;
						renderDetail();
						return;
					}
					return;
				}
				if (target.classList?.contains("overlay")) {
					closeModal();
					return;
				}
				if (target.closest("[data-stop]")) return;
				const scopeEl = target.closest("[data-scope]");
				if (scopeEl) {
					ui.scope = scopeEl.getAttribute("data-scope") ?? "today";
					ui.view = "list";
					ui.space = "all";
					renderAll();
					return;
				}
				const viewEl = target.closest("[data-view]");
				if (viewEl) {
					const next = viewEl.getAttribute("data-view") ?? "board";
					if (ui.view === "notes" && next !== "notes") flushNoteSave();
					ui.view = next;
					renderAll();
					if (ui.view === "portal") refreshPortal();
					if (ui.view === "news") loadNews();
					if (ui.view === "notes") loadNotes();
					if (ui.view === "bugs") loadBugs();
					if (ui.view === "product") loadProducts();
					if (ui.view === "test") loadTests();
					return;
				}
				const productNodeFoldEl = target.closest("[data-product-node-fold]");
				if (productNodeFoldEl !== null) {
					event.stopPropagation();
					toggleNodeFold(productNodeFoldEl.getAttribute("data-product-node-fold") ?? "");
					return;
				}
				const productNodeEl = target.closest("[data-product-node]");
				if (productNodeEl !== null) {
					productNodeSelected = productNodeEl.getAttribute("data-product-node");
					renderContent();
					return;
				}
				const productNoteEl = target.closest("[data-product-note]");
				if (productNoteEl !== null) {
					openProductNote(productNoteEl.getAttribute("data-product-note") ?? "");
					return;
				}
				const productDemoEl = target.closest("[data-product-demo]");
				if (productDemoEl !== null) {
					productDemoSelected = productDemoEl.getAttribute("data-product-demo") ?? "";
					renderContent();
					return;
				}
				const bugEl = target.closest("[data-bug-id]");
				if (bugEl !== null) {
					openBugDetail(bugEl.getAttribute("data-bug-id") ?? "");
					return;
				}
				const noteEl = target.closest("[data-note-id]");
				if (noteEl) {
					selectNote(noteEl.getAttribute("data-note-id") ?? "");
					return;
				}
				const spaceEl = target.closest("[data-space]");
				if (spaceEl) {
					const space = spaceEl.getAttribute("data-space") ?? "all";
					ui.space = ui.space === space && space !== "all" ? "all" : space;
					renderAll();
					return;
				}
				const idEl = target.closest("[data-id]");
				if (idEl) {
					const id = idEl.getAttribute("data-id") ?? "";
					if (id !== "") {
						const task = taskOf(id);
						if (ui.view === "calendar" && task) {
							ui.view = "list";
							ui.scope = task.date === todayKey() ? "today" : "all";
						}
						ui.selected = id;
						ui.detailTab = "detail";
						ui.subNoteId = null;
						if (ui.view === "focus") timer.taskId = id;
						if (($id("wb-modal")?.innerHTML ?? "") !== "") closeModal();
						renderAll();
					}
				}
			}
			function onKeydown(event) {
				if (event.key === "Escape" && ctxMenuOpen) {
					closeContextMenu();
					return;
				}
				if (ui.view === "notes" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault();
					event.stopPropagation();
					flushNoteSave();
					return;
				}
				const tag = event.target?.tagName;
				const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
				const modalOpen = ($id("wb-modal")?.innerHTML ?? "") !== "";
				if (ui.view === "product" && productTab === "map" && !typing && !modalOpen) {
					const inCanvas = event.target?.closest("#pm-plot") !== null;
					if (event.key === "Tab" && !inCanvas) {
						event.preventDefault();
						event.stopPropagation();
						openNodeQuickAdd("child");
						return;
					}
					if (event.key === "Enter" && !inCanvas && productNodeSelected !== null) {
						event.preventDefault();
						event.stopPropagation();
						openNodeQuickAdd("sibling");
						return;
					}
					if (event.key === "F2") {
						event.preventDefault();
						event.stopPropagation();
						openNodeProperty();
						return;
					}
					if (event.key === "Delete" || event.key === "Backspace") {
						if (productNodeSelected !== null) {
							event.preventDefault();
							event.stopPropagation();
							deleteProductNode();
						}
						return;
					}
				}
				if (event.key === "Enter") {
					const target = event.target;
					const actionable = target?.closest("[data-act]");
					if (actionable && actionable.getAttribute("data-act") !== "noop" && target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA" && target?.tagName !== "SELECT") {
						event.preventDefault();
						actionable.click();
						return;
					}
				}
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
					event.preventDefault();
					event.stopPropagation();
					openCommandPalette();
					return;
				}
				if (event.key === "Escape") closeModal();
			}
			function onVisibility() {
				if (document.visibilityState === "hidden") {
					if (dirty) flush();
					if (noteDirty) flushNoteSave();
				}
			}
			async function reloadFromServer() {
				if (saveTimer !== 0) {
					window.clearTimeout(saveTimer);
					saveTimer = 0;
				}
				try {
					const res = await fetch(`${API}/state`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					applyRemote(await res.json());
					ui.compact = db.settings.compact === true;
					initSideWidth();
					if (ui.selected === null) ui.selected = chooseSelection();
					dirty = false;
					setSaveState("saved");
					renderAll();
					toast("已从数据库刷新");
				} catch (cause) {
					toast(`刷新失败：${String(cause.message)}`);
				}
			}
			async function boot() {
				loaded = false;
				loadError = "";
				renderContent();
				if (saveTimer !== 0) {
					window.clearTimeout(saveTimer);
					saveTimer = 0;
				}
				try {
					const res = await fetch(`${API}/state`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					applyRemote(await res.json());
					ui.compact = db.settings.compact === true;
					initSideWidth();
					if (ui.selected === null) ui.selected = chooseSelection();
					if (timer.taskId === null) timer.taskId = chooseSelection();
					loaded = true;
					renderAll();
					agentPanel.load().then(() => {
						if (ui.view === "portal") renderAll();
					});
					if (ui.view === "portal") refreshPortal();
					if (ui.view === "news") loadNews();
					if (ui.view === "notes") loadNotes();
					if (ui.view === "bugs") loadBugs();
					if (ui.view === "product") loadProducts();
					if (ui.view === "test") loadTests();
				} catch (cause) {
					loadError = String(cause.message ?? cause);
					loaded = false;
					renderContent();
				}
			}
			const clickListener = (e) => onClick(e);
			const keyListener = (e) => onKeydown(e);
			const contextListener = (e) => onContextMenu(e);
			shadow.addEventListener("click", clickListener);
			shadow.addEventListener("keydown", keyListener);
			shadow.addEventListener("contextmenu", contextListener);
			shadow.addEventListener("scroll", closeContextMenu, true);
			window.addEventListener("visibilitychange", onVisibility);
			const onSideResizeDown = (event) => {
				const target = event.target;
				const handle = target === null ? null : target.closest("[data-resize=\"side\"]");
				if (handle === null) return;
				const pointer = event;
				if (typeof pointer.button === "number" && pointer.button !== 0) return;
				pointer.preventDefault();
				const app = $id("wb-app");
				if (app === null) return;
				try {
					handle.setPointerCapture(pointer.pointerId);
				} catch {}
				const startX = pointer.clientX;
				const startWidth = sideWidth;
				let done = false;
				app.classList.add("resizing");
				const move = (next) => {
					applySideWidth(startWidth + (next.clientX - startX), false);
				};
				const finish = () => {
					if (done) return;
					done = true;
					window.removeEventListener("pointermove", move);
					window.removeEventListener("pointerup", finish);
					window.removeEventListener("pointercancel", finish);
					window.removeEventListener("blur", finish);
					app.classList.remove("resizing");
					applySideWidth(sideWidth, true);
				};
				window.addEventListener("pointermove", move);
				window.addEventListener("pointerup", finish);
				window.addEventListener("pointercancel", finish);
				window.addEventListener("blur", finish);
			};
			/** 双击把手回到默认宽度。 */
			const onSideResizeReset = (event) => {
				const target = event.target;
				if (target === null || target.closest("[data-resize=\"side\"]") === null) return;
				applySideWidth(window.matchMedia("(max-width:1250px)").matches ? SIDE_DEFAULT_NARROW : SIDE_DEFAULT, true);
			};
			shadow.addEventListener("pointerdown", onSideResizeDown);
			shadow.addEventListener("dblclick", onSideResizeReset);
			const themeObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(() => {
				if ((db.settings.theme ?? "auto") === "auto") applyTheme();
			}) : null;
			themeObserver?.observe(document.body, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme", "data-theme"]
			});
			themeObserver?.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-theme", "data-ds-dark-theme"]
			});
			const tick = window.setInterval(() => {
				if (!timer.running) return;
				timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1e3));
				if (timer.remaining <= 0) {
					timer.running = false;
					timer.endsAt = 0;
					const minutes = timer.preset;
					db.focus.push({
						id: uid("f"),
						taskId: timer.taskId,
						startedAt: nowStamp(),
						minutes,
						completed: true
					});
					timer.remaining = minutes * 60;
					renderContent();
					scheduleSave();
					toast(`完成一轮专注 · ${minutes} 分钟`);
					return;
				}
				if (ui.view === "focus") {
					const timeNode = shadow.querySelector(".timer-time");
					if (timeNode) timeNode.textContent = `${pad(Math.floor(timer.remaining / 60))}:${pad(timer.remaining % 60)}`;
					const ring = shadow.querySelector(".timer-ring");
					if (ring) ring.style.setProperty("--p", String(Math.round((1 - timer.remaining / (timer.preset * 60)) * 100)));
				}
			}, 1e3);
			const hostObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
				if (collapseTouched) return;
				const should = hostEl.clientWidth > 0 && hostEl.clientWidth < 1250;
				if (ui.collapsed !== should) {
					ui.collapsed = should;
					renderAll();
				}
			}) : null;
			hostObserver?.observe(hostEl);
			const newsTick = window.setInterval(() => {
				if (!loaded || ui.view !== "news" || ui.newsLoading) return;
				const interval = newsWatchUntil > Date.now() ? 6e3 : 25e3;
				if (Date.now() - lastNewsPoll < interval) return;
				loadNews(true);
			}, 5e3);
			const bugTick = window.setInterval(() => {
				if (!loaded || ui.view !== "bugs" || bugLoading) return;
				loadBugs(true);
			}, 6e3);
			const productTick = window.setInterval(() => {
				if (!loaded || ui.view !== "product" || productLoading) return;
				loadProducts(true);
			}, 12e3);
			const demoTick = window.setInterval(() => {
				if (!loaded || ui.view !== "product") return;
				if (demoProgress?.status !== "running") return;
				loadDemoProgress(productSelected ?? "");
			}, 4e3);
			const testTick = window.setInterval(() => {
				if (!loaded || ui.view !== "test" || testLoading) return;
				loadTests(true);
			}, 12e3);
			const noteTick = window.setInterval(() => {
				if (!loaded || ui.view !== "notes" || noteLoading || noteDirty) return;
				loadNotes(true);
			}, 15e3);
			boot();
			return { destroy() {
				try {
					ideaView?.destroy();
				} catch (cause) {
					console.warn("[dsh-workbench] 灵感视图卸载失败", cause);
				}
				ideaView = null;
				if (saveTimer !== 0) window.clearTimeout(saveTimer);
				if (noteSaveTimer !== 0) window.clearTimeout(noteSaveTimer);
				if (toastTimer !== 0) window.clearTimeout(toastTimer);
				window.clearInterval(tick);
				window.clearInterval(newsTick);
				window.clearInterval(bugTick);
				window.clearInterval(productTick);
				window.clearInterval(demoTick);
				window.clearInterval(testTick);
				window.clearInterval(noteTick);
				hostObserver?.disconnect();
				shadow.removeEventListener("click", clickListener);
				shadow.removeEventListener("keydown", keyListener);
				shadow.removeEventListener("contextmenu", contextListener);
				shadow.removeEventListener("scroll", closeContextMenu, true);
				shadow.removeEventListener("pointerdown", onSideResizeDown);
				shadow.removeEventListener("dblclick", onSideResizeReset);
				window.removeEventListener("visibilitychange", onVisibility);
				themeObserver?.disconnect();
				shadow.innerHTML = "";
			} };
		}
		const SHELL = `
<div class="app" id="wb-app">
  <aside class="sidebar" id="wb-sidebar"></aside>
  <div class="side-resizer" id="wb-side-resizer" data-resize="side" role="separator" aria-orientation="vertical" title="拖动调整侧栏宽度 · 双击复位"></div>
  <div class="main">
    <header class="topbar" id="wb-topbar"></header>
    <div class="workspace">
      <section class="content" id="wb-content"><div id="wb-generic"></div><div id="wb-idea-root" style="display:none"></div></section>
      <aside class="detail" id="wb-detail"></aside>
    </div>
  </div>
</div>
<div id="wb-modal"></div>
<div id="wb-ctxmenu" class="ctxmenu"></div>
<div class="toast" id="wb-toast"></div>`;
		// src/client/index.ts
		/**
		* dsh-workbench · 浏览器半侧入口
		*
		* 注册：
		*  - main 面板 key=workbench（个人工作台主体，Shadow DOM 隔离）
		*  - 侧栏「工作台」入口：克隆 DSH 原生「新建会话」按钮，与 dsh-cron 的「定时任务」
		*    放在同一组（同为 sidebar-entry），因此尺寸、图标、文字、收起行为完全一致。
		*
		* 工作台是独立面板：不抢启动落点，用户从侧栏随时进入。
		*/
		const PANEL_ID = "workbench";
		const ENTRY_ATTR = "data-dsh-workbench-entry";
		const ENTRY_CLASS = "dsh-workbench-entry-clone";
		const SIDEBAR_HANDLE = "__dshWorkbenchSidebarEntry";
		const ENTRY_CSS = `
/* 提高优先级：原生 newSession 规则在克隆样式之后加载，同优先级会把 gap 覆盖成 0 */
button.${ENTRY_CLASS}{display:flex;align-items:center;gap:8px}
.dsh-workbench-entry-icon{display:flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px}
.dsh-workbench-entry-label{text-overflow:ellipsis;overflow:hidden}
[data-sidebar-collapsed] .dsh-workbench-entry-label,
[data-dsh-frame][data-sidebar-collapsed] .dsh-workbench-entry-label{display:none}
`;
		/** 工作台容器：占满面板高度；内部由 mountWorkbench 建立 Shadow DOM。 */
		function WorkbenchPanel(props) {
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const el = ref.current;
				if (el === null) return void 0;
				let handle = null;
				try {
					handle = mountWorkbench(el, props.ctx);
				} catch (cause) {
					console.warn("[dsh-workbench] 挂载失败：", String(cause));
				}
				return () => {
					try {
						handle?.destroy();
					} catch (cause) {
						console.warn("[dsh-workbench] 卸载失败：", String(cause));
					}
				};
			}, []);
			return (0, react.createElement)("div", {
				ref,
				"data-dsh-workbench-panel": "",
				style: {
					height: "100%",
					minHeight: "620px",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden"
				}
			});
		}
		function ensureCss() {
			if (document.getElementById("dsh-workbench-entry-css") !== null) return;
			const style = document.createElement("style");
			style.id = "dsh-workbench-entry-css";
			style.textContent = ENTRY_CSS;
			document.head.appendChild(style);
		}
		/** 原生「新建会话」按钮（带 newSession 类、排除 label 变体）。 */
		function nativeButton() {
			for (const node of Array.from(document.querySelectorAll("button[class*=\"newSession\"]"))) if (String(node.className).indexOf("newSessionLabel") === -1) return node;
		}
		/**
		* 克隆侧栏入口，插到 dsh-cron 的「定时任务」之后；cron 尚未挂载时先跟在
		* 「新建会话」后面，MutationObserver 会在 cron 出现后把工作台移到它后面。
		*/
		function mountSidebarEntry(ctx) {
			ensureCss();
			window[SIDEBAR_HANDLE]?.dispose();
			document.querySelectorAll(`[${ENTRY_ATTR}]`).forEach((node) => node.remove());
			let entry = null;
			let disposed = false;
			const place = () => {
				if (disposed) return;
				const target = nativeButton();
				if (target === void 0 || target.parentElement === null) return;
				if (entry === null) {
					entry = target.cloneNode(true);
					entry.className = `${String(target.className)} ${ENTRY_CLASS}`;
					entry.setAttribute(ENTRY_ATTR, "");
					entry.setAttribute("data-dsh-plugin", "dsh-workbench");
					entry.setAttribute("data-dsh-part", "sidebar-entry");
					entry.setAttribute("aria-label", "工作台");
					entry.removeAttribute("id");
					entry.removeAttribute("aria-keyshortcuts");
					entry.innerHTML = "";
					const icon = document.createElement("span");
					icon.className = "dsh-workbench-entry-icon";
					icon.innerHTML = "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"></rect><path d=\"M8 9h8\"></path><path d=\"M8 13h5\"></path></svg>";
					const label = document.createElement("span");
					label.className = "dsh-workbench-entry-label";
					label.textContent = "工作台";
					entry.appendChild(icon);
					entry.appendChild(label);
					entry.addEventListener("click", (event) => {
						event.preventDefault();
						event.stopPropagation();
						try {
							ctx.layout?.selectPanel(PANEL_ID);
						} catch (cause) {
							console.warn("[dsh-workbench] 打开面板失败：", String(cause));
						}
					});
				}
				const cron = document.querySelector("[data-dsh-plugin=\"dsh-cron\"][data-dsh-part=\"sidebar-entry\"]");
				const anchor = cron instanceof HTMLElement ? cron : target;
				if (entry.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", entry);
			};
			const observer = new MutationObserver(place);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			const timer = window.setInterval(place, 2e3);
			place();
			const controller = { dispose() {
				disposed = true;
				observer.disconnect();
				window.clearInterval(timer);
				entry?.remove();
				entry = null;
			} };
			window[SIDEBAR_HANDLE] = controller;
			return controller;
		}
		/**
		* DSH 的 main 是「面板/会话」共用的插槽。工作台作为自定义 main 面板打开后，
		* 直接点侧栏会话仍会保留 workbench 面板 key，导致会话区渲染为空。
		* 在捕获阶段先清空面板选择，再让 DSH 自己的会话点击继续切换。
		*/
		const SESSION_RESET_HANDLE = "__dshWorkbenchSessionReset";
		function installSessionPanelReset(ctx) {
			const previous = window[SESSION_RESET_HANDLE];
			previous?.();
			const isSessionTarget = (target) => {
				if (!(target instanceof Element)) return false;
				if (target.closest("[data-row-key^=\"session:\"], [data-session-id]") !== null) return true;
				const button = target.closest("button");
				return button !== null && (button.getAttribute("aria-label") === "新建会话" || button.textContent?.trim() === "新建会话");
			};
			const closePanel = (event) => {
				if (!isSessionTarget(event.target)) return;
				try {
					ctx.layout?.selectPanel(null);
				} catch (cause) {
					console.warn("[dsh-workbench] 退出面板失败：", String(cause));
				}
				window.setTimeout(() => {
					try {
						if (document.querySelector("[data-dsh-workbench-panel]") !== null) ctx.layout?.selectPanel(null);
					} catch {}
				}, 80);
			};
			document.addEventListener("click", closePanel, true);
			const dispose = () => {
				document.removeEventListener("click", closePanel, true);
			};
			window[SESSION_RESET_HANDLE] = dispose;
			return dispose;
		}
		const inject = ["slots", "layout"];
		function apply(ctx) {
			const Panel = () => (0, react.createElement)(WorkbenchPanel, { ctx });
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				inject: () => ({})
			}, Panel));
			mountSidebarEntry(ctx);
			installSessionPanelReset(ctx);
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
