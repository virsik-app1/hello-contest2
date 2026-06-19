import React from 'react';

// Self-contained, no-login member-app demo for showing on a phone in front of
// customers. Rendered only when the URL hash starts with "member-demo" (see
// index.js) so the real owner app and its Cognito login are never touched.
// The whole experience lives inside an isolated iframe so its CSS/JS can't
// affect (or be affected by) the main bundle.

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>PulseRetain — Member</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#1a1a2e;-webkit-tap-highlight-color:transparent}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;background:#f4f5f7;overflow:hidden}
#screens{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.panel{display:none}
.panel.on{display:block}
.topsafe{padding-top:calc(env(safe-area-inset-top) + 12px)}
.hdr{display:flex;align-items:center;gap:10px;background:#1a1a2e;color:#fff;padding:0 14px 13px;font-size:16px;font-weight:600}
.brandbar{display:flex;align-items:center;justify-content:space-between;background:#1a1a2e;color:#fff;padding:0 16px 13px}
.pill{display:inline-flex;align-items:center;gap:7px;background:#e74c3c;padding:6px 13px;border-radius:20px;font-family:Georgia,serif;font-size:14px;font-weight:600}
.body{padding:16px 14px 26px}
.lcard{background:#fff;border:1px solid #e9eaee;border-radius:14px}
.mut{color:#6b6b80;font-size:13px}
.row{display:flex;align-items:center;justify-content:space-between}
.pbtn{cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;border-radius:11px;width:100%;padding:13px;border:none}
.seg{cursor:pointer;font-family:inherit;font-size:13px;border:none;background:none;padding:8px 0;flex:1;color:#6b6b80;border-radius:8px}
.seg.on{background:#fff;color:#1a1a2e;font-weight:600}
.day{cursor:pointer;font-family:inherit;font-size:12px;border:1px solid #d8d9e0;background:#fff;color:#6b6b80;padding:7px 13px;border-radius:20px;white-space:nowrap}
.day.on{background:#1a1a2e;color:#fff;border-color:#1a1a2e}
.li{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45;margin-bottom:9px}
.nav{display:flex;background:#fff;border-top:1px solid #e6e7ec;padding:0 4px calc(env(safe-area-inset-bottom) + 4px)}
.nb{background:none;border:none;flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 0;cursor:pointer;color:#9a9aae;font-size:11px;font-family:inherit}
.nb.on{color:#e74c3c}
.nb i{font-size:23px}
.tog{display:inline-block;width:44px;height:26px;border-radius:14px;position:relative;cursor:pointer;background:#cfd1d8}
.bk{cursor:pointer;font-size:26px;line-height:1;color:#cfcfe6;background:none;border:none;padding:0}
.ov{position:fixed;inset:0;display:none;z-index:50}
#toast{position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 78px);background:rgba(26,26,46,.95);color:#fff;font-size:13px;padding:11px 14px;border-radius:11px;text-align:center;display:none;z-index:60}
</style>
</head>
<body>
<div id="app">
<div id="screens">

<div id="p-today" class="panel on">
  <div class="brandbar topsafe"><span class="pill"><i class="ti ti-activity-heartbeat"></i>PulseRetain</span><i class="ti ti-bell" style="font-size:20px"></i></div>
  <div class="body">
    <div style="font-size:20px;font-weight:700;color:#1a1a2e">Good afternoon, Jordan</div>
    <div class="mut" style="margin-bottom:14px">Wednesday, June 18</div>
    <div class="lcard" style="padding:14px;margin-bottom:12px">
      <div class="row"><span style="background:#fdeceb;color:#c0392b;font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px">NEXT CLASS</span><span class="mut" style="font-size:12px">in 2h 18m</span></div>
      <div style="font-size:17px;font-weight:600;color:#1a1a2e;margin-top:10px">Spin</div>
      <div class="mut" style="margin-bottom:8px">with Maya R.</div>
      <div class="mut" style="display:flex;gap:14px;font-size:12px;margin-bottom:12px"><span><i class="ti ti-clock" style="font-size:14px;vertical-align:-2px"></i> 6:00 PM</span><span><i class="ti ti-map-pin" style="font-size:14px;vertical-align:-2px"></i> Studio A</span></div>
      <div class="row" style="gap:10px"><button class="pbtn act-checkin" style="flex:1;background:#e74c3c;color:#fff"><i class="ti ti-qrcode" style="font-size:15px;vertical-align:-2px"></i> Check in</button><span style="background:#e8f7ee;color:#1e7e45;font-size:12px;font-weight:600;padding:9px 12px;border-radius:9px"><i class="ti ti-check" style="font-size:14px;vertical-align:-2px"></i> Booked</span></div>
    </div>
    <div class="lcard" style="padding:14px;margin-bottom:12px">
      <div class="row" style="margin-bottom:12px"><span style="font-weight:600;color:#1a1a2e">This week</span><span class="mut" style="font-size:12px">3 of 4 visits</span></div>
      <div class="row" id="weekdots" style="margin-bottom:12px"></div>
      <div style="height:7px;background:#edeef2;border-radius:6px;overflow:hidden"><div style="width:75%;height:100%;background:#27ae60"></div></div>
      <div class="row" style="margin-top:10px"><span class="mut" style="font-size:12px">1 more to hit your goal</span><span style="color:#b7770d;font-size:12px;font-weight:600"><i class="ti ti-flame" style="font-size:14px;vertical-align:-2px"></i> 4-week streak</span></div>
    </div>
    <div class="row" style="gap:10px;margin-bottom:12px">
      <button class="pbtn lcard" data-tab="classes" style="flex:1;color:#1a1a2e;padding:13px 8px;text-align:center"><i class="ti ti-calendar-plus" style="font-size:18px;display:block;margin-bottom:4px;color:#185fa5"></i>Book a class</button>
      <button class="pbtn lcard" data-tab="me" style="flex:1;color:#1a1a2e;padding:13px 8px;text-align:center"><i class="ti ti-qrcode" style="font-size:18px;display:block;margin-bottom:4px;color:#8e44ad"></i>My card</button>
    </div>
    <div id="todayTravel" style="display:none;margin-bottom:12px"></div>
    <button class="lcard" data-tab="messages" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;padding:13px;background:#fff">
      <div class="row"><span style="background:#e8f1fb;color:#185fa5;font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px">FROM YOUR GYM</span><i class="ti ti-chevron-right mut" style="font-size:16px"></i></div>
      <div style="color:#1a1a2e;font-size:14px;margin-top:9px">New Saturday HIIT class added</div>
      <div class="mut" style="font-size:12px">Tap to read · 1d ago</div>
    </button>
  </div>
</div>

<div id="p-classes" class="panel">
  <div class="hdr topsafe">Classes</div>
  <div class="body">
    <div class="mut" style="margin-top:-6px;margin-bottom:12px">Book your next session</div>
    <div style="display:flex;background:#e9eaf0;border-radius:10px;padding:3px;margin-bottom:14px">
      <button class="seg on" data-seg="browse">Browse</button>
      <button class="seg" data-seg="mine">My bookings · 2</button>
    </div>
    <div data-pane="browse">
      <div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px"><button class="day on">Today</button><button class="day">Thu 19</button><button class="day">Fri 20</button><button class="day">Sat 21</button></div>
      <div class="lcard" style="padding:13px;margin-bottom:10px">
        <div class="row"><div><div style="color:#1a1a2e;font-weight:600;font-size:15px">Spin</div><div class="mut" style="font-size:12px">Maya R.</div></div><div style="text-align:right"><div style="color:#1a1a2e;font-size:13px;font-weight:600">6:00 PM</div><div class="mut" style="font-size:11px">Studio A</div></div></div>
        <div class="row" style="margin-top:11px"><span style="color:#1e7e45;font-size:12px">4 spots left</span><span style="background:#e8f7ee;color:#1e7e45;font-size:12px;font-weight:600;padding:7px 13px;border-radius:9px"><i class="ti ti-check" style="font-size:13px;vertical-align:-2px"></i> Booked</span></div>
      </div>
      <div class="lcard" style="padding:13px;margin-bottom:10px">
        <div class="row"><div><div style="color:#1a1a2e;font-weight:600;font-size:15px">Strength 101</div><div class="mut" style="font-size:12px">Devon K.</div></div><div style="text-align:right"><div style="color:#1a1a2e;font-size:13px;font-weight:600">7:30 PM</div><div class="mut" style="font-size:11px">Weight room</div></div></div>
        <div class="row" style="margin-top:11px"><span class="mut" style="font-size:12px">8 spots left</span><button class="act-book" style="cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;background:#fff;color:#c0392b;border:1px solid #e74c3c;padding:8px 18px;border-radius:10px">Book</button></div>
      </div>
      <div class="lcard" style="padding:13px;margin-bottom:10px">
        <div class="row"><div><div style="color:#1a1a2e;font-weight:600;font-size:15px">Yoga Flow</div><div class="mut" style="font-size:12px">Priya S.</div></div><div style="text-align:right"><div style="color:#1a1a2e;font-size:13px;font-weight:600">8:00 PM</div><div class="mut" style="font-size:11px">Studio B</div></div></div>
        <div class="row" style="margin-top:11px"><span style="color:#b7770d;font-size:12px">Class full</span><button class="act-wait" style="cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;background:#fdf3e0;color:#b7770d;border:none;padding:9px 15px;border-radius:10px">Join waitlist</button></div>
      </div>
    </div>
    <div data-pane="mine" style="display:none">
      <div class="lcard" style="padding:13px;margin-bottom:10px"><div class="row"><div><div style="color:#1a1a2e;font-weight:600;font-size:15px">Spin · Maya R.</div><div class="mut" style="font-size:12px">Today · 6:00 PM · Studio A</div></div><button class="act-cancel" style="cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;background:#fff;color:#6b6b80;border:1px solid #d8d9e0;padding:8px 14px;border-radius:10px">Cancel</button></div></div>
      <div class="lcard" style="padding:13px;margin-bottom:10px"><div class="row"><div><div style="color:#1a1a2e;font-weight:600;font-size:15px">Yoga Flow · Priya S.</div><div class="mut" style="font-size:12px">Thu · 7:00 AM · Studio B</div></div><button class="act-cancel" style="cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;background:#fff;color:#6b6b80;border:1px solid #d8d9e0;padding:8px 14px;border-radius:10px">Cancel</button></div></div>
      <div class="mut" style="font-size:12px;text-align:center;margin-top:14px">You can cancel up to 2 hours before class.</div>
    </div>
  </div>
</div>

<div id="p-scans" class="panel">
  <div class="hdr topsafe">My scan-ins</div>
  <div class="body">
    <div class="mut" style="margin-top:-6px;margin-bottom:14px">Your check-in history</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="lcard" style="padding:12px"><div class="mut" style="font-size:12px">This week</div><div style="font-size:23px;font-weight:700;color:#1a1a2e">3</div></div>
      <div class="lcard" style="padding:12px"><div class="mut" style="font-size:12px">Weekly goal</div><div style="font-size:23px;font-weight:700;color:#1a1a2e">4</div></div>
      <div class="lcard" style="padding:12px"><div class="mut" style="font-size:12px">Current streak</div><div style="font-size:23px;font-weight:700;color:#c0392b">4 wks</div></div>
      <div class="lcard" style="padding:12px"><div class="mut" style="font-size:12px">This month</div><div style="font-size:23px;font-weight:700;color:#1a1a2e">14</div></div>
    </div>
    <div class="lcard" style="padding:14px;margin-bottom:14px">
      <div class="mut" style="font-size:12px;margin-bottom:12px">Last 4 weeks</div>
      <div style="display:flex;align-items:flex-end;gap:14px;height:96px;padding:0 6px">
        <div style="flex:1;text-align:center"><div style="height:54px;background:#cdeedd;border-radius:6px"></div><div class="mut" style="font-size:11px;margin-top:6px">W1</div></div>
        <div style="flex:1;text-align:center"><div style="height:72px;background:#27ae60;border-radius:6px"></div><div class="mut" style="font-size:11px;margin-top:6px">W2</div></div>
        <div style="flex:1;text-align:center"><div style="height:36px;background:#cdeedd;border-radius:6px"></div><div class="mut" style="font-size:11px;margin-top:6px">W3</div></div>
        <div style="flex:1;text-align:center"><div style="height:54px;background:#f3c5c1;border-radius:6px"></div><div class="mut" style="font-size:11px;margin-top:6px">This</div></div>
      </div>
    </div>
    <div style="font-weight:600;color:#1a1a2e;font-size:14px;margin-bottom:8px">Recent scan-ins</div>
    <div class="lcard" style="overflow:hidden;margin-bottom:14px">
      <div class="row" style="padding:12px 14px;border-bottom:1px solid #eef0f3"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-map-pin" style="font-size:15px;color:#185fa5;vertical-align:-2px"></i> Front desk</span><span class="mut" style="font-size:12px">Today · 7:32 AM</span></div>
      <div class="row" style="padding:12px 14px;border-bottom:1px solid #eef0f3"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-map-pin" style="font-size:15px;color:#185fa5;vertical-align:-2px"></i> Front desk</span><span class="mut" style="font-size:12px">Mon · 6:05 PM</span></div>
      <div class="row" style="padding:12px 14px"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-map-pin" style="font-size:15px;color:#185fa5;vertical-align:-2px"></i> Front desk</span><span class="mut" style="font-size:12px">Sat · 9:11 AM</span></div>
    </div>
    <div style="background:#eaf3ff;border:1px solid #cfe3fb;border-radius:12px;padding:13px;display:flex;gap:10px;align-items:flex-start">
      <i class="ti ti-trophy" style="font-size:19px;color:#185fa5"></i>
      <div style="font-size:13px;color:#0c447c;line-height:1.5">One more visit beats last week and keeps your 4-week streak alive.</div>
    </div>
  </div>
</div>

<div id="p-messages" class="panel">
  <div class="hdr topsafe">Messages</div>
  <div class="body">
    <div class="mut" style="margin-top:-6px;margin-bottom:14px">Updates from your gym</div>
    <div class="mut" style="font-size:12px;font-weight:600;margin-bottom:8px">ANNOUNCEMENTS</div>
    <div class="lcard" style="padding:13px;margin-bottom:10px">
      <div style="color:#1a1a2e;font-weight:600;font-size:14px"><i class="ti ti-speakerphone" style="font-size:16px;color:#e74c3c;vertical-align:-2px"></i> Holiday hours this weekend</div>
      <div class="mut" style="font-size:13px;margin-top:6px;line-height:1.5">We close at 4 PM Saturday &amp; Sunday. Plan your sessions ahead!</div>
      <div class="mut" style="font-size:11px;margin-top:7px">2h ago</div>
    </div>
    <div class="lcard" style="padding:13px;margin-bottom:16px">
      <div style="color:#1a1a2e;font-weight:600;font-size:14px"><i class="ti ti-speakerphone" style="font-size:16px;color:#e74c3c;vertical-align:-2px"></i> New Saturday HIIT class</div>
      <div class="mut" style="font-size:13px;margin-top:6px;line-height:1.5">Maya is launching a 9 AM HIIT class this Saturday. Spots are limited — book early.</div>
      <div class="mut" style="font-size:11px;margin-top:7px">1d ago</div>
    </div>
    <div class="mut" style="font-size:12px;font-weight:600;margin-bottom:8px">CHAT WITH THE FRONT DESK</div>
    <div class="lcard" style="padding:13px">
      <div class="row"><span style="display:flex;align-items:center;gap:10px"><span style="width:36px;height:36px;border-radius:50%;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600">FD</span><span><span style="color:#1a1a2e;font-weight:600;font-size:14px">Front desk</span><span style="display:block;font-size:12px;color:#6b6b80">Great to see you back, Jordan! Want me to…</span></span></span><span style="width:9px;height:9px;border-radius:50%;background:#e74c3c"></span></div>
    </div>
    <div class="mut" style="font-size:11px;margin-top:12px;line-height:1.5;text-align:center">Replies go only to your gym's staff — never to other members.</div>
  </div>
</div>

<div id="p-me" class="panel">
  <div class="hdr topsafe">Me</div>
  <div class="body">
    <div style="display:flex;align-items:center;gap:13px;margin-bottom:16px">
      <span style="width:52px;height:52px;border-radius:50%;background:#8e44ad;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600">JL</span>
      <div><div style="font-size:17px;font-weight:600;color:#1a1a2e">Jordan Lee</div><div class="mut" style="font-size:13px">Member since Jan 2026</div></div>
    </div>
    <div style="background:#1a1a2e;border-radius:16px;padding:16px;margin-bottom:14px;color:#fff">
      <div class="row"><div><div style="font-size:11px;color:#b9b9d0">MEMBERSHIP</div><div style="font-size:15px;font-weight:600;margin-top:2px">Unlimited Monthly</div></div><span style="background:#27ae60;color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:7px">Active</span></div>
      <div style="background:#fff;border-radius:12px;padding:12px;margin:14px 0 10px;display:flex;justify-content:center"><div id="qr" style="display:grid;grid-template-columns:repeat(13,1fr);gap:2px;width:160px;height:160px"></div></div>
      <div style="text-align:center;font-size:12px;color:#cfcfe6">Show at the front desk to scan in</div>
      <div class="row" style="margin-top:12px;border-top:1px solid #33334f;padding-top:11px;font-size:12px"><span style="color:#b9b9d0">Member #4471</span><span style="color:#b9b9d0">Renews Jul 1, 2026</span></div>
    </div>
    <div class="lcard" style="overflow:hidden;margin-bottom:14px">
      <div class="row" style="padding:13px 14px;border-bottom:1px solid #eef0f3"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-bell" style="font-size:17px;color:#6b6b80;vertical-align:-3px"></i> Push notifications</span><span class="tog2" data-tog></span></div>
      <button data-act="openLoc" style="width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #eef0f3;cursor:pointer;font-family:inherit;padding:13px 14px"><div class="row"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-map-pin-cog" style="font-size:17px;color:#6b6b80;vertical-align:-3px"></i> Location &amp; visit privacy</span><span style="display:flex;align-items:center;gap:8px"><span id="mePill" style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:#fdf3e0;color:#b7770d">Off</span><i class="ti ti-chevron-right mut" style="font-size:16px"></i></span></div></button>
      <div class="row" style="padding:13px 14px"><span style="color:#1a1a2e;font-size:14px"><i class="ti ti-help-circle" style="font-size:17px;color:#6b6b80;vertical-align:-3px"></i> Help &amp; support</span><i class="ti ti-chevron-right mut" style="font-size:16px"></i></div>
    </div>
    <div style="background:#f0faf4;border:1px solid #cdeedd;border-radius:12px;padding:13px;display:flex;gap:10px;align-items:flex-start;margin-bottom:14px">
      <i class="ti ti-shield-check" style="font-size:19px;color:#1e7e45"></i>
      <div style="font-size:13px;color:#1e7e45;line-height:1.5">You only see your own activity. Other members' information is never shared with you.</div>
    </div>
    <button class="pbtn" style="background:#fff;color:#c0392b;border:1px solid #f3c5c1">Sign out</button>
  </div>
</div>

<div id="p-l-privacy" class="panel">
  <div class="hdr topsafe"><button class="bk" data-act="locBack">‹</button><span>Location &amp; visit privacy</span></div>
  <div class="body">
    <button class="lcard" data-act="locRow" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;padding:14px;margin-bottom:14px;background:#fff">
      <div class="row"><span style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:10px;background:#f0ecf9;display:flex;align-items:center;justify-content:center"><i class="ti ti-map-pin-cog" style="font-size:20px;color:#8e44ad"></i></span><span style="color:#1a1a2e;font-weight:600;font-size:15px">Nearby Gyms</span></span><span id="statusPill" style="font-size:11px;font-weight:600;padding:4px 11px;border-radius:20px;background:#fdf3e0;color:#b7770d">Off</span></div>
      <div class="mut" id="rowSub" style="margin-top:9px;line-height:1.45">See a private log of gyms you visit while you travel. Only you can ever see it.</div>
    </button>
    <div class="lcard" style="padding:13px 14px;margin-bottom:14px"><div class="row"><span style="color:#185fa5;font-size:14px"><i class="ti ti-file-text" style="font-size:16px;vertical-align:-3px"></i> Read our location privacy policy</span><i class="ti ti-chevron-right mut" style="font-size:16px"></i></div></div>
    <div style="background:#f0faf4;border:1px solid #cdeedd;border-radius:12px;padding:13px;display:flex;gap:10px;align-items:flex-start">
      <i class="ti ti-shield-check" style="font-size:19px;color:#1e7e45"></i>
      <div style="font-size:13px;color:#1e7e45;line-height:1.5">PulseRetain never shows your location to your gym, to other members, or to anyone else.</div>
    </div>
  </div>
</div>

<div id="p-l-priming" class="panel">
  <div class="hdr topsafe"><button class="bk" data-act="primingBack">‹</button><span>Nearby Gyms</span></div>
  <div class="body" style="text-align:center">
    <div style="width:64px;height:64px;border-radius:18px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;margin:6px auto 14px"><i class="ti ti-shield-lock" style="font-size:31px;color:#e74c3c"></i></div>
    <div style="font-size:19px;font-weight:700;color:#1a1a2e;margin-bottom:8px">See your gym journey, kept just for you</div>
    <div class="mut" style="line-height:1.55;margin-bottom:16px;text-align:left">Turn this on and your phone will privately note when you visit other gyms — handy for travel and day passes — so your full workout history lives in one place.</div>
    <div style="background:#f5f6f8;border-radius:12px;padding:14px;text-align:left;margin-bottom:18px">
      <div class="li"><i class="ti ti-eye-off" style="font-size:18px;color:#1e7e45"></i><span style="color:#2c2c3a"><b>Only you</b> can ever see your visits.</span></div>
      <div class="li"><i class="ti ti-device-mobile" style="font-size:18px;color:#1e7e45"></i><span style="color:#2c2c3a">Your location <b>never leaves your phone</b> — we don't store or share it.</span></div>
      <div class="li" style="margin-bottom:0"><i class="ti ti-toggle-left" style="font-size:18px;color:#1e7e45"></i><span style="color:#2c2c3a">Turn it off <b>anytime</b> in Privacy.</span></div>
    </div>
    <button class="pbtn" data-act="askOS" style="background:#e74c3c;color:#fff;margin-bottom:10px">Turn on location</button>
    <button class="pbtn" data-act="primingBack" style="background:#fff;color:#1a1a2e;border:1px solid #d8d9e0;margin-bottom:14px">Not now</button>
    <div style="font-size:12px;color:#185fa5;margin-bottom:8px">How we protect your location</div>
    <div class="mut" style="font-size:12px">This is optional. The app works fully without it.</div>
  </div>
</div>

<div id="p-l-denied" class="panel">
  <div class="hdr topsafe"><button class="bk" data-act="primingBack">‹</button><span>Nearby Gyms</span></div>
  <div class="body" style="text-align:center">
    <div style="width:58px;height:58px;border-radius:50%;background:#fdf3e0;display:flex;align-items:center;justify-content:center;margin:14px auto"><i class="ti ti-map-pin-off" style="font-size:27px;color:#b7770d"></i></div>
    <div style="font-size:17px;font-weight:700;color:#1a1a2e;margin-bottom:8px">Location is off</div>
    <div class="mut" style="line-height:1.55;margin-bottom:20px">We can't log your visits without it. You can turn it back on in your phone's Settings whenever you like.</div>
    <button class="pbtn" data-act="settings" style="background:#1a1a2e;color:#fff;margin-bottom:10px">Open Settings</button>
    <button class="pbtn" data-act="primingBack" style="background:#fff;color:#1a1a2e;border:1px solid #d8d9e0">Back</button>
  </div>
</div>

<div id="p-l-confirm" class="panel">
  <div class="hdr topsafe"><span style="width:14px"></span><span>Nearby Gyms</span></div>
  <div class="body" style="text-align:center">
    <div style="width:64px;height:64px;border-radius:50%;background:#e8f7ee;display:flex;align-items:center;justify-content:center;margin:24px auto 16px"><i class="ti ti-check" style="font-size:33px;color:#1e7e45"></i></div>
    <div style="font-size:19px;font-weight:700;color:#1a1a2e;margin-bottom:10px">You're set</div>
    <div class="mut" style="line-height:1.55;margin-bottom:24px">We'll quietly add other gyms you visit to your private travel log. Manage or turn this off anytime in Me &gt; Privacy &gt; Nearby Gyms.</div>
    <button class="pbtn" data-act="toDash" style="background:#e74c3c;color:#fff">View my privacy settings</button>
  </div>
</div>

<div id="p-l-dashboard" class="panel">
  <div class="hdr topsafe"><button class="bk" data-act="locBack">‹</button><span>Nearby Gyms</span></div>
  <div class="body">
    <div class="lcard" style="padding:14px;margin-bottom:14px">
      <div class="row"><span style="color:#1a1a2e;font-weight:600;font-size:15px">Visit tracking</span><span class="tog" data-master></span></div>
      <div class="mut" style="margin-top:7px;line-height:1.45">When off, we collect no location data and detect no visits.</div>
      <div class="row" style="margin-top:14px;border-top:1px solid #eef0f3;padding-top:13px"><span style="color:#1a1a2e;font-size:14px">Detect visits when app is closed</span><span class="tog" data-bg></span></div>
    </div>
    <div class="lcard" style="padding:14px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;color:#1e7e45;margin-bottom:11px">WHAT WE COLLECT</div>
      <div class="li"><i class="ti ti-check" style="font-size:17px;color:#1e7e45"></i><span style="color:#2c2c3a">The <b>name</b> of a gym when you arrive</span></div>
      <div class="li"><i class="ti ti-check" style="font-size:17px;color:#1e7e45"></i><span style="color:#2c2c3a">The <b>date and time</b> of the visit</span></div>
      <div class="li" style="margin-bottom:0"><i class="ti ti-check" style="font-size:17px;color:#1e7e45"></i><span style="color:#2c2c3a">Whether it's your <b>home club or another gym</b></span></div>
    </div>
    <div class="lcard" style="padding:14px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;color:#c0392b;margin-bottom:11px">WHAT WE NEVER COLLECT</div>
      <div class="li"><i class="ti ti-x" style="font-size:17px;color:#c0392b"></i><span style="color:#2c2c3a">Your real-time location or a map of your movements</span></div>
      <div class="li"><i class="ti ti-x" style="font-size:17px;color:#c0392b"></i><span style="color:#2c2c3a">Anywhere you go that isn't a gym (home, work…)</span></div>
      <div class="li" style="margin-bottom:0"><i class="ti ti-x" style="font-size:17px;color:#c0392b"></i><span style="color:#2c2c3a">We never sell, share, or show your location to your gym</span></div>
    </div>
    <div class="row" style="margin:4px 2px 8px"><span style="font-size:12px;font-weight:600;color:#6b6b80">YOUR VISITS</span><button data-act="simulate" style="cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;background:#f0ecf9;color:#8e44ad;border:none;padding:6px 11px;border-radius:8px"><i class="ti ti-walk" style="font-size:13px;vertical-align:-2px"></i> Simulate a visit (demo)</button></div>
    <div id="visitList"></div>
    <button class="pbtn" data-act="delall" style="background:#fff;color:#c0392b;border:1px solid #f3c5c1;margin-top:4px">Delete all history</button>
  </div>
</div>

</div>

<div class="nav" id="nav">
  <button class="nb on" data-tab="today"><i class="ti ti-home"></i>Today</button>
  <button class="nb" data-tab="classes"><i class="ti ti-calendar"></i>Classes</button>
  <button class="nb" data-tab="scans"><i class="ti ti-qrcode"></i>Scan-ins</button>
  <button class="nb" data-tab="messages"><i class="ti ti-mail"></i>Messages</button>
  <button class="nb" data-tab="me"><i class="ti ti-user"></i>Me</button>
</div>
</div>

<div id="os" class="ov" style="background:rgba(10,10,25,.55);align-items:center;justify-content:center;padding:34px">
  <div style="background:#f3f3f5;border-radius:16px;width:100%;max-width:300px;overflow:hidden;text-align:center">
    <div style="padding:18px 18px 14px">
      <div style="width:46px;height:46px;border-radius:11px;background:#1a1a2e;display:flex;align-items:center;justify-content:center;margin:0 auto 11px"><span style="color:#e74c3c;font-family:Georgia,serif;font-size:13px;font-weight:600">PR</span></div>
      <div id="osTitle" style="font-size:15px;font-weight:600;color:#1a1a2e;margin-bottom:7px"></div>
      <div id="osBody" class="mut" style="font-size:12px;line-height:1.45"></div>
      <div style="margin-top:12px;height:72px;border-radius:9px;background:#dfe6ee;display:flex;align-items:center;justify-content:center;color:#7a899b;font-size:11px"><i class="ti ti-map-2" style="font-size:18px;margin-right:5px"></i> approximate area</div>
    </div>
    <div id="osBtns" style="border-top:1px solid #d0d0d6"></div>
  </div>
</div>

<div id="push" class="ov" style="top:0;left:0;right:0;bottom:auto;padding:calc(env(safe-area-inset-top) + 8px) 8px 0">
  <button data-act="openVisit" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;background:rgba(28,28,46,.94);color:#fff;border:none;border-radius:16px;padding:13px 15px">
    <div class="row" style="margin-bottom:4px"><span style="display:flex;align-items:center;gap:7px;font-size:12px;color:#cfcfe6"><span style="width:18px;height:18px;border-radius:5px;background:#e74c3c;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-family:Georgia,serif">PR</span>PULSERETAIN</span><span style="font-size:11px;color:#9a9ab5">now</span></div>
    <div style="font-size:14px;font-weight:600;margin-bottom:2px">Visit logged privately</div>
    <div style="font-size:13px;color:#dcdcec;line-height:1.4">You visited Anytime Fitness — Downtown. This stays private to you — only you can see it.</div>
  </button>
</div>

<div id="toast"></div>

<script>
(function(){
  var MAIN=['today','classes','scans','messages','me'];
  var locEnabled=false, locBg=false, visits=[];
  function $(id){return document.getElementById(id)}
  function toast(t){var el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(function(){el.style.display='none'},2600)}
  function show(id){
    var ps=document.querySelectorAll('.panel');
    for(var i=0;i<ps.length;i++)ps[i].classList.remove('on');
    var el=$('p-'+id); if(el)el.classList.add('on');
    var isMain=MAIN.indexOf(id)>=0;
    $('nav').style.display=isMain?'flex':'none';
    if(isMain){var nbs=document.querySelectorAll('.nb');for(var j=0;j<nbs.length;j++)nbs[j].classList.toggle('on',nbs[j].getAttribute('data-tab')===id)}
    $('screens').scrollTop=0;
  }
  function renderLocState(){
    var on=locEnabled;
    var sp=$('statusPill'), mp=$('mePill'), sub=$('rowSub');
    [sp,mp].forEach(function(p){if(!p)return;p.textContent=on?'On':'Off';p.style.background=on?'#e8f7ee':'#fdf3e0';p.style.color=on?'#1e7e45':'#b7770d'});
    if(sub)sub.textContent=on?'Tracking your gym visits privately. Tap to manage or turn it off.':'See a private log of gyms you visit while you travel. Only you can ever see it.';
    var tt=$('todayTravel');
    if(tt){
      if(on){
        var last=visits.length?('<div style="color:#1a1a2e;font-size:14px;margin-top:9px">'+visits[0].name+'</div><div class="mut" style="font-size:12px">'+visits[0].when+'</div>'):'<div class="mut" style="font-size:13px;margin-top:9px">No trips logged yet — we\\'ll add other gyms you visit.</div>';
        tt.innerHTML='<button data-act="openLoc" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;background:#fff;border:1px solid #e9eaee;border-radius:14px;padding:13px"><div class="row"><span style="background:#f0ecf9;color:#8e44ad;font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px">YOUR TRAVEL LOG</span><span style="font-size:11px;color:#8e44ad">Private to you</span></div>'+last+'</button>';
        tt.style.display='block';
      } else { tt.style.display='none'; tt.innerHTML=''; }
    }
  }
  function paintTog(t,on){if(!t)return;t.style.background=on?'#27ae60':'#cfd1d8';t.innerHTML='<span style="position:absolute;top:2px;left:'+(on?'20px':'2px')+';width:22px;height:22px;border-radius:50%;background:#fff"></span>'}
  function renderDash(){
    paintTog(document.querySelector('[data-master]'),locEnabled);
    paintTog(document.querySelector('[data-bg]'),locBg);
    var box=$('visitList');
    if(!visits.length){box.innerHTML='<div class="lcard" style="padding:18px;text-align:center;color:#9a9aae;font-size:13px;margin-bottom:10px">No visits logged yet.</div>';return}
    box.innerHTML='';
    for(var i=0;i<visits.length;i++){
      var v=visits[i];
      var tagBg=v.type==='other'?'#e8f1fb':'#e8f7ee', tagC=v.type==='other'?'#185fa5':'#1e7e45', tag=v.type==='other'?'Other gym':'Home club';
      box.insertAdjacentHTML('beforeend','<div class="lcard" style="padding:12px 13px;margin-bottom:8px"><div class="row"><div><div style="color:#1a1a2e;font-size:14px;font-weight:600">'+v.name+'</div><div class="mut" style="font-size:12px;margin-top:3px">'+v.when+'  ·  <span style="color:'+tagC+';background:'+tagBg+';padding:1px 8px;border-radius:10px;font-size:11px">'+tag+'</span></div></div><button data-del="'+i+'" style="background:none;border:none;cursor:pointer;color:#b0b0bd;padding:4px"><i class="ti ti-trash" style="font-size:18px"></i></button></div></div>');
    }
    var dels=box.querySelectorAll('[data-del]');
    for(var d=0;d<dels.length;d++){(function(b){b.onclick=function(){visits.splice(parseInt(b.getAttribute('data-del'),10),1);renderDash();renderLocState()}})(dels[d])}
  }
  function opt(label,val){return '<button data-os="'+val+'" style="width:100%;background:none;border:none;border-top:1px solid #d0d0d6;padding:13px;font-size:15px;font-family:inherit;cursor:pointer;color:#185fa5">'+label+'</button>'}
  function osDialog(kind){
    var title=$('osTitle'), body=$('osBody'), btns=$('osBtns');
    if(kind==='always'){
      title.textContent='Allow “PulseRetain” to also use your location when closed?';
      body.textContent='Allow background location so we can log gym visits even when the app is closed. This stays private to you and you can turn it off anytime.';
      btns.innerHTML=opt('Change to Always Allow','always-yes')+opt('Keep Only While Using','always-no');
    } else {
      title.textContent='Allow “PulseRetain” to use your location?';
      body.textContent='Used to privately log the gyms you visit so you can see your own workout history. Only you can see this.';
      btns.innerHTML=opt('Allow While Using App','wiu')+opt('Allow Once','once')+opt('Don\\'t Allow','deny');
    }
    $('os').style.display='flex';
    var obs=btns.querySelectorAll('[data-os]');
    for(var i=0;i<obs.length;i++){(function(b){b.onclick=function(){handleOS(b.getAttribute('data-os'))}})(obs[i])}
  }
  function handleOS(v){
    $('os').style.display='none';
    if(v==='wiu'||v==='once'){locEnabled=true;renderLocState();show('l-confirm')}
    else if(v==='deny'){show('l-denied')}
    else if(v==='always-yes'){locBg=true;renderDash();toast('Background detection on.')}
    else if(v==='always-no'){locBg=false;renderDash()}
  }

  document.addEventListener('click',function(e){
    var tb=e.target.closest('[data-tab]'); if(tb){show(tb.getAttribute('data-tab'));return}
    var a=e.target.closest('[data-act]'); if(!a)return; var act=a.getAttribute('data-act');
    if(act==='openLoc'){ if(locEnabled){show('l-dashboard');renderDash()}else{show('l-privacy')} renderLocState(); }
    else if(act==='locRow'){ locEnabled?(show('l-dashboard'),renderDash()):show('l-priming'); }
    else if(act==='locBack'){ show('me'); renderLocState(); }
    else if(act==='primingBack'){ show('l-privacy'); }
    else if(act==='askOS'){ osDialog('wiu'); }
    else if(act==='toDash'){ show('l-dashboard'); renderDash(); }
    else if(act==='settings'){ toast('(this opens your phone\\'s Settings app)'); }
    else if(act==='delall'){ if(!visits.length){toast('No history to delete.');return} if(confirm('Delete all visit history? This can\\'t be undone.')){visits=[];renderDash();renderLocState();toast('All visit history permanently deleted.')} }
    else if(act==='simulate'){ if(!locEnabled){toast('Turn the feature on first — it\\'s off by default.');return} $('push').style.display='block'; }
    else if(act==='openVisit'){ $('push').style.display='none'; var exists=false; for(var i=0;i<visits.length;i++){if(visits[i].name==='Anytime Fitness — Downtown')exists=true} if(!exists)visits.unshift({name:'Anytime Fitness — Downtown',when:'Today · 6:14 PM',type:'other'}); show('l-dashboard'); renderDash(); renderLocState(); }
  });

  var segs=document.querySelectorAll('.seg');
  for(var s=0;s<segs.length;s++){(function(el){el.onclick=function(){for(var k=0;k<segs.length;k++)segs[k].classList.remove('on');el.classList.add('on');var mine=el.getAttribute('data-seg')==='mine';document.querySelector('[data-pane="browse"]').style.display=mine?'none':'block';document.querySelector('[data-pane="mine"]').style.display=mine?'block':'none'}})(segs[s])}
  var days=document.querySelectorAll('.day');
  for(var dd=0;dd<days.length;dd++){(function(el){el.onclick=function(){for(var k=0;k<days.length;k++)days[k].classList.remove('on');el.classList.add('on')}})(days[dd])}
  var books=document.querySelectorAll('.act-book');
  for(var b=0;b<books.length;b++){books[b].onclick=function(){this.outerHTML='<span style="background:#e8f7ee;color:#1e7e45;font-size:12px;font-weight:600;padding:8px 13px;border-radius:9px"><i class="ti ti-check" style="font-size:13px;vertical-align:-2px"></i> Booked</span>'}}
  var waits=document.querySelectorAll('.act-wait');
  for(var w=0;w<waits.length;w++){waits[w].onclick=function(){this.textContent='On waitlist';this.style.background='#eef0f3';this.style.color='#6b6b80'}}
  var cins=document.querySelectorAll('.act-checkin');
  for(var c=0;c<cins.length;c++){cins[c].onclick=function(){this.innerHTML='<i class="ti ti-check" style="font-size:15px;vertical-align:-2px"></i> Checked in';this.style.background='#27ae60'}}
  var cancels=document.querySelectorAll('.act-cancel');
  for(var cc=0;cc<cancels.length;cc++){cancels[cc].onclick=function(){this.textContent='Cancelled';this.disabled=true;this.style.color='#b0b0bd';this.style.borderColor='#e6e7ec'}}
  var togs=document.querySelectorAll('.tog2');
  for(var tg=0;tg<togs.length;tg++){(function(t){function p(){var on=t.getAttribute('data-on')==='1';t.style.background=on?'#27ae60':'#cfd1d8';t.innerHTML='<span style="position:absolute;top:2px;left:'+(on?'20px':'2px')+';width:22px;height:22px;border-radius:50%;background:#fff"></span>'}t.setAttribute('data-on','1');p();t.onclick=function(){t.setAttribute('data-on',t.getAttribute('data-on')==='1'?'0':'1');p()}})(togs[tg])}

  var master=document.querySelector('[data-master]');
  master.addEventListener('click',function(){ if(locEnabled){locEnabled=false;locBg=false;renderLocState();renderDash();toast('Tracking off — all collection stopped.')}else{locEnabled=true;renderLocState();renderDash()} });
  var bgT=document.querySelector('[data-bg]');
  bgT.addEventListener('click',function(){ if(!locEnabled){toast('Turn on visit tracking first.');return} if(!locBg){osDialog('always')}else{locBg=false;renderDash()} });

  var wk=$('weekdots');
  if(wk){var labels=['M','T','W','T','F','S','S'];var done=[1,1,1,0,0,0,0];var today=2;
    for(var i=0;i<7;i++){var on=done[i];wk.insertAdjacentHTML('beforeend','<div style="text-align:center"><div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;margin:0 auto;'+(on?'background:#27ae60;color:#fff;':'background:#fff;border:1px solid #d8d9e0;color:#9a9aae;')+(i===today?'box-shadow:0 0 0 2px #1a1a2e;':'')+'">'+(on?'<i class="ti ti-check" style="font-size:15px"></i>':labels[i])+'</div></div>')}
  }
  var qr=$('qr');
  if(qr){var N=13;for(var i=0;i<N*N;i++){var r=Math.floor(i/N),c=i%N;var on;
    if(r<3&&c<3){on=(r===0||r===2||c===0||c===2)}
    else if(r<3&&c>=N-3){var c2=c-(N-3);on=(r===0||r===2||c2===0||c2===2)}
    else if(r>=N-3&&c<3){var r2=r-(N-3);on=(r2===0||r2===2||c===0||c===2)}
    else{on=((r*5+c*3+r*c)%4===0)||(((r+c)%3===0)&&((r*c)%2===0))}
    qr.insertAdjacentHTML('beforeend','<div style="width:100%;padding-bottom:100%;background:'+(on?'#101024':'transparent')+';border-radius:1px"></div>')}
  }

  renderLocState(); renderDash();
})();
</script>
</body>
</html>`;

export default function MemberDemo() {
  return (
    <iframe
      title="PulseRetain member demo"
      srcDoc={HTML}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}
