/** 灵感视图样式（注入 shadow root，类名统一 idea-* 前缀，避免与工作台既有样式冲突）。 */
export const IDEA_CSS = String.raw`
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
`
