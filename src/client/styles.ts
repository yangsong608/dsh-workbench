/* eslint-disable */
/** 工作台样式（Shadow DOM 内生效；由 dsh-portal 原型 CSS 迁移）。 */
export const WORKBENCH_CSS = String.raw`
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

`
