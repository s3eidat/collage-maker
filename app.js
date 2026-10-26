/* Collage Maker — layouts are unit rectangles; one render() draws both the preview and the full-size export. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var PREVIEW = 900;

  // ---------- layouts ----------
  function grid(c, r) { var o = []; for (var y = 0; y < r; y++) for (var x = 0; x < c; x++) o.push([x / c, y / r, 1 / c, 1 / r]); return o; }
  function rows(ns) { var o = [], h = 1 / ns.length; ns.forEach(function (n, ri) { for (var i = 0; i < n; i++) o.push([i / n, ri * h, 1 / n, h]); }); return o; }
  function cols(ns) { return rows(ns).map(function (r) { return [r[1], r[0], r[3], r[2]]; }); }
  function inside(p, cells) { return cells.map(function (r) { return [p[0] + r[0] * p[2], p[1] + r[1] * p[3], r[2] * p[2], r[3] * p[3]]; }); }
  var T = 1 / 3;
  var TPL = {
    2: [["Side by side", grid(2, 1)], ["Stacked", grid(1, 2)]],
    3: [["Big left", [[0, 0, .5, 1]].concat(inside([.5, 0, .5, 1], grid(1, 2)))], ["Big top", [[0, 0, 1, .5]].concat(inside([0, .5, 1, .5], grid(2, 1)))], ["Columns", grid(3, 1)], ["Rows", grid(1, 3)]],
    4: [["Grid", grid(2, 2)], ["Big left", [[0, 0, 2 * T, 1]].concat(inside([2 * T, 0, T, 1], grid(1, 3)))], ["Big top", [[0, 0, 1, 2 * T]].concat(inside([0, 2 * T, 1, T], grid(3, 1)))], ["Columns", grid(4, 1)]],
    5: [["2 + 3", rows([2, 3])], ["3 + 2", rows([3, 2])], ["Big left", [[0, 0, .5, 1]].concat(inside([.5, 0, .5, 1], grid(2, 2)))], ["Columns 2 + 3", cols([2, 3])]],
    6: [["3 × 2", grid(3, 2)], ["2 × 3", grid(2, 3)], ["Big + 5", [[0, 0, 2 * T, 2 * T]].concat(inside([2 * T, 0, T, 2 * T], grid(1, 2)), inside([0, 2 * T, 1, T], grid(3, 1)))], ["1 + 2 + 3", rows([1, 2, 3])]],
    7: [["3 + 4", rows([3, 4])], ["Big left + 6", [[0, 0, .5, 1]].concat(inside([.5, 0, .5, 1], grid(2, 3)))], ["2 + 3 + 2", rows([2, 3, 2])], ["1 + 6", [[0, 0, 1, .5]].concat(inside([0, .5, 1, .5], grid(3, 2)))]],
    8: [["4 × 2", grid(4, 2)], ["2 × 4", grid(2, 4)], ["3 + 2 + 3", rows([3, 2, 3])], ["Big + 7", [[0, 0, .5, .5]].concat(inside([.5, 0, .5, .5], grid(1, 2)).slice(0, 1), inside([.5, .25, .5, .25], grid(2, 1)), inside([0, .5, 1, .5], grid(4, 1)))]],
    9: [["3 × 3", grid(3, 3)], ["2 + 3 + 4", rows([2, 3, 4])], ["4 + 5", rows([4, 5])], ["Columns 3 × 3", cols([3, 3, 3])]]
  };
  var SIZES = [["Square 1:1", 2048, 2048], ["Portrait 4:5 (Instagram)", 1600, 2000], ["Story 9:16", 1080, 1920], ["Landscape 16:9", 1920, 1080],
    ["Landscape 3:2", 2400, 1600], ["Print A4 portrait (300 dpi)", 2480, 3508]];

  var EPS = 1e-9;
  function cellRects(cells, W, H, gap) {
    return cells.map(function (r) {
      var x0 = r[0] * W + (r[0] < EPS ? gap : gap / 2), x1 = (r[0] + r[2]) * W - (r[0] + r[2] > 1 - EPS ? gap : gap / 2);
      var y0 = r[1] * H + (r[1] < EPS ? gap : gap / 2), y1 = (r[1] + r[3]) * H - (r[1] + r[3] > 1 - EPS ? gap : gap / 2);
      return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    });
  }
  // "cover" fit, then zoom; px/py (0..1) pick which part of the overflow is visible, like object-position.
  function place(p, r) {
    var s = Math.max(r.w / p.w, r.h / p.h) * p.zoom, dw = p.w * s, dh = p.h * s;
    return { x: r.x + (r.w - dw) * p.px, y: r.y + (r.h - dh) * p.py, w: dw, h: dh };
  }
  function rr(c, x, y, w, h, rad) {
    rad = Math.max(0, Math.min(rad, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath();
  }

  // ---------- state ----------
  var saved = S3.store("cm.settings") || {};
  var st = Object.assign({ count: 4, tpl: 1, size: 0, gap: 12, radius: 10, bg: "#ffffff", fmt: "jpeg" }, saved);
  var photos = new Array(9).fill(null), sel = 0;
  var cv = $("#cv"), ctx = cv.getContext("2d");

  function cells() { var list = TPL[st.count]; return list[Math.min(st.tpl, list.length - 1)][1]; }
  function dims() { return SIZES[st.size] || SIZES[0]; }
  function unit(W, H) { return Math.min(W, H) / 1000; }

  function render(canvas, W, H, preview) {
    canvas.width = W; canvas.height = H;
    var c = canvas.getContext("2d"), u = unit(W, H), rects = cellRects(cells(), W, H, st.gap * u), rad = st.radius * u;
    c.fillStyle = st.bg; c.fillRect(0, 0, W, H);
    c.imageSmoothingQuality = "high";
    rects.forEach(function (r, i) {
      var p = photos[i];
      c.save(); rr(c, r.x, r.y, r.w, r.h, rad); c.clip();
      if (p) { var d = place(p, r); c.drawImage(p.img, d.x, d.y, d.w, d.h); }
      else if (preview) {
        c.fillStyle = "rgba(128,140,155,.22)"; c.fillRect(r.x, r.y, r.w, r.h);
        c.fillStyle = "rgba(110,120,135,.95)"; c.font = "600 " + Math.max(11, Math.min(r.w, r.h) * 0.09) + "px Inter, system-ui, sans-serif";
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("+ Add photo", r.x + r.w / 2, r.y + r.h / 2);
      }
      c.restore();
      if (preview && i === sel && photos[i]) {
        c.save(); rr(c, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, Math.max(0, rad - 1.5));
        c.lineWidth = 3; c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3dd6d0"; c.stroke(); c.restore();
      }
    });
    return rects;
  }

  var rectsNow = [], queued = false;
  function draw() {
    if (queued) return; queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var d = dims(), k = Math.min(1, PREVIEW / Math.max(d[1], d[2]));
      rectsNow = render(cv, Math.round(d[1] * k), Math.round(d[2] * k), true);
      syncCellbar();
    });
  }
  function persist() { S3.store("cm.settings", st); }

  // ---------- controls ----------
  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === String(value)));
      b.addEventListener("click", function () { $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); onPick(b.dataset.v); });
    });
  }
  for (var n = 2; n <= 9; n++) $("#count").appendChild(S3.h("button", { "data-v": n, "aria-pressed": "false", text: String(n) }));
  seg($("#count"), st.count, function (v) { st.count = +v; st.tpl = 0; sel = Math.min(sel, st.count - 1); tplButtons(); persist(); draw(); });

  function tplButtons() {
    var box = $("#tpls"); box.innerHTML = "";
    TPL[st.count].forEach(function (t, i) {
      var b = S3.h("button", { "class": "cm-tpl", title: t[0], "aria-label": t[0], "aria-pressed": String(i === st.tpl) });
      t[1].forEach(function (r) {
        b.appendChild(S3.h("span", { style: "left:" + r[0] * 100 + "%;top:" + r[1] * 100 + "%;width:" + r[2] * 100 + "%;height:" + r[3] * 100 + "%" }));
      });
      b.addEventListener("click", function () { st.tpl = i; $$(".cm-tpl").forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); persist(); draw(); });
      box.appendChild(b);
    });
  }
  tplButtons();

  SIZES.forEach(function (s, i) { $("#size").appendChild(S3.h("option", { value: i, text: s[0] + " — " + s[1] + "×" + s[2] })); });
  $("#size").value = st.size;
  $("#size").addEventListener("change", function () { st.size = +this.value; persist(); labels(); draw(); });
  function labels() {
    var d = dims(), u = unit(d[1], d[2]);
    $("#gLbl").textContent = Math.round(st.gap * u) + " px"; $("#rLbl").textContent = Math.round(st.radius * u) + " px";
    $("#outInfo").textContent = "Output: " + d[1] + " × " + d[2] + " px " + (st.fmt === "png" ? "PNG" : "JPG") + ".";
  }
  [["gap", "gap"], ["radius", "radius"]].forEach(function (p) {
    var el = $("#" + p[0]); el.value = st[p[1]];
    el.addEventListener("input", function () { st[p[1]] = +el.value; labels(); persist(); draw(); });
  });
  function normHex(v) { var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim()); if (!m) return null; var x = m[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return "#" + x.toLowerCase(); }
  $("#bg").value = st.bg; $("#bgHex").value = st.bg;
  $("#bg").addEventListener("input", function () { st.bg = this.value; $("#bgHex").value = this.value; persist(); draw(); });
  $("#bgHex").addEventListener("input", function () { var v = normHex(this.value); if (v) { st.bg = v; $("#bg").value = v; persist(); draw(); } });
  $("#bgHex").addEventListener("change", function () { this.value = st.bg; });
  seg($("#fmt"), st.fmt, function (v) { st.fmt = v; persist(); labels(); });
  labels();

  // ---------- photos ----------
  function loadFile(f) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () { res({ img: img, url: url, w: img.naturalWidth, h: img.naturalHeight, zoom: 1, px: 0.5, py: 0.5 }); };
      img.onerror = function () { URL.revokeObjectURL(url); S3.toast("Couldn't read " + f.name, "error"); res(null); };
      img.src = url;
    });
  }
  function setPhoto(i, p) { if (photos[i] && photos[i].url) URL.revokeObjectURL(photos[i].url); photos[i] = p; }
  // Fill starting at cell `from` (that cell first, then empty cells). Grows the layout if more photos than cells.
  function addFiles(files, from) {
    Promise.all(files.slice(0, 9).map(loadFile)).then(function (ps) {
      ps = ps.filter(Boolean); if (!ps.length) return;
      if (files.length > 9) S3.toast("A collage holds up to 9 photos; extra ones were skipped", "error");
      var targets = [], i;
      if (from != null) targets.push(from);
      for (i = 0; i < 9 && targets.length < ps.length; i++) if (!photos[i] && targets.indexOf(i) < 0) targets.push(i);
      targets.slice(0, ps.length).forEach(function (t, k) { setPhoto(t, ps[k]); });
      var used = 0; for (i = 0; i < 9; i++) if (photos[i]) used = i + 1;
      if (used > st.count) { st.count = used; st.tpl = 0; $$("#count button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.v === used)); }); tplButtons(); persist(); }
      sel = targets[0]; draw();
    });
  }
  S3.drop($("#add"), function (fs) { addFiles(fs); }, { accept: "image/*", multiple: true });
  var one = S3.h("input", { type: "file", accept: "image/*", hidden: true }), oneTarget = 0;
  document.body.appendChild(one);
  one.addEventListener("change", function () { if (one.files.length) addFiles([one.files[0]], oneTarget); one.value = ""; });
  function pick(i) { oneTarget = i; one.click(); }

  function toCanvas(e) {
    var b = cv.getBoundingClientRect();
    return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height };
  }
  function hit(pt) {
    for (var i = 0; i < rectsNow.length; i++) { var r = rectsNow[i]; if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return i; }
    return -1;
  }
  function pan(i, dx, dy) {
    var p = photos[i]; if (!p) return;
    var r = rectsNow[i], d = place(p, r), ox = d.w - r.w, oy = d.h - r.h;
    if (ox > 0.5) p.px = Math.min(1, Math.max(0, p.px - dx / ox));
    if (oy > 0.5) p.py = Math.min(1, Math.max(0, p.py - dy / oy));
  }
  var drag = null;
  cv.addEventListener("pointerdown", function (e) {
    var pt = toCanvas(e), i = hit(pt); if (i < 0) return;
    drag = { i: i, x: pt.x, y: pt.y, moved: false };
    if (photos[i]) { sel = i; cv.setPointerCapture(e.pointerId); draw(); }
  });
  cv.addEventListener("pointermove", function (e) {
    if (!drag || !photos[drag.i]) return;
    var pt = toCanvas(e), dx = pt.x - drag.x, dy = pt.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    pan(drag.i, dx, dy); drag.x = pt.x; drag.y = pt.y; draw();
  });
  cv.addEventListener("pointerup", function () { if (drag && !photos[drag.i] && !drag.moved) pick(drag.i); drag = null; });
  cv.addEventListener("pointercancel", function () { drag = null; });
  cv.addEventListener("wheel", function (e) {
    var i = hit(toCanvas(e)); if (i < 0 || !photos[i]) return;
    e.preventDefault(); sel = i;
    photos[i].zoom = Math.min(4, Math.max(1, photos[i].zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); draw();
  }, { passive: false });
  cv.addEventListener("keydown", function (e) {
    var p = photos[sel], step = cv.width / 40;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(sel); return; }
    if (e.key === "Tab") return;
    if (/^[1-9]$/.test(e.key) && +e.key <= st.count) { sel = +e.key - 1; draw(); return; }
    if (!p) return;
    var k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (k) { e.preventDefault(); pan(sel, k[0], k[1]); draw(); }
    else if (e.key === "+" || e.key === "=") { p.zoom = Math.min(4, p.zoom * 1.1); draw(); }
    else if (e.key === "-") { p.zoom = Math.max(1, p.zoom / 1.1); draw(); }
    else if (e.key === "Delete" || e.key === "Backspace") { setPhoto(sel, null); draw(); }
  });
  var stage = $("#stage");
  stage.addEventListener("dragover", function (e) { e.preventDefault(); stage.classList.add("is-over"); });
  stage.addEventListener("dragleave", function () { stage.classList.remove("is-over"); });
  stage.addEventListener("drop", function (e) {
    e.preventDefault(); stage.classList.remove("is-over");
    var fs = Array.prototype.slice.call(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!fs.length) return;
    var i = hit(toCanvas(e)); addFiles(fs, i >= 0 ? i : null);
  });
  document.addEventListener("paste", function (e) {
    var fs = Array.prototype.slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
    if (fs.length) { e.preventDefault(); addFiles(fs, photos[sel] ? null : sel); }
  });

  function syncCellbar() {
    var p = photos[sel];
    $("#cellName").textContent = "Cell " + (sel + 1);
    ["zoom", "prev", "next", "remove"].forEach(function (id) { $("#" + id).disabled = !p; });
    $("#prev").disabled = !p || sel === 0; $("#next").disabled = !p || sel >= st.count - 1;
    $("#replace").textContent = p ? "Replace" : "Add";
    $("#zoom").value = p ? Math.round(p.zoom * 100) : 100; $("#zLbl").textContent = (p ? Math.round(p.zoom * 100) : 100) + "%";
    var empty = 0; for (var i = 0; i < st.count; i++) if (!photos[i]) empty++;
    $("#hint").textContent = empty ? empty + " empty cell" + (empty > 1 ? "s" : "") + " · drop photos on the collage" : "Drag to reposition · scroll to zoom";
  }
  $("#zoom").addEventListener("input", function () { if (photos[sel]) { photos[sel].zoom = +this.value / 100; draw(); } });
  $("#replace").addEventListener("click", function () { pick(sel); });
  $("#remove").addEventListener("click", function () { setPhoto(sel, null); draw(); });
  function swap(j) { var t = photos[sel]; photos[sel] = photos[j]; photos[j] = t; sel = j; draw(); }
  $("#prev").addEventListener("click", function () { if (sel > 0) swap(sel - 1); });
  $("#next").addEventListener("click", function () { if (sel < st.count - 1) swap(sel + 1); });

  $("#dl").addEventListener("click", function () {
    var filled = photos.slice(0, st.count).filter(Boolean).length;
    if (!filled) { S3.toast("Add some photos first", "error"); return; }
    if (filled < st.count) S3.toast((st.count - filled) + " cell(s) are empty and will show the background");
    var d = dims(), c = document.createElement("canvas");
    render(c, d[1], d[2], false);
    c.toBlob(function (b) {
      if (!b) { S3.toast("Your browser couldn't encode this size", "error"); return; }
      S3.download(b, "collage-" + d[1] + "x" + d[2] + (st.fmt === "png" ? ".png" : ".jpg"));
      $("#outInfo").textContent = "Saved " + d[1] + " × " + d[2] + " px, " + S3.fmtBytes(b.size) + ".";
      S3.done();
    }, "image/" + st.fmt, 0.92);
  });

  draw();

  // ---------- sample photos, drawn locally ----------
  function art(kind, w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d"), g, i;
    if (kind === 0) {
      g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ff9a6b"); g.addColorStop(1, "#ffd59a"); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = "#fff4d6"; x.beginPath(); x.arc(w * .62, h * .55, h * .16, 0, 7); x.fill();
      x.fillStyle = "#6b4a7b"; x.beginPath(); x.moveTo(0, h); for (i = 0; i <= w; i += 10) x.lineTo(i, h * .72 - Math.sin(i / 70) * h * .06 - Math.sin(i / 23) * 6); x.lineTo(w, h); x.fill();
    } else if (kind === 1) {
      g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#0e9f9a"); g.addColorStop(1, "#1d3b6e"); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (i = 0; i < 7; i++) { x.strokeStyle = "rgba(255,255,255," + (0.12 + i * 0.05) + ")"; x.lineWidth = 6; x.beginPath(); for (var k = 0; k <= w; k += 8) x.lineTo(k, h * (.2 + i * .11) + Math.sin(k / 60 + i) * 18); x.stroke(); }
    } else if (kind === 2) {
      x.fillStyle = "#2a1f4a"; x.fillRect(0, 0, w, h);
      var cs = ["#f05a7e", "#ffb347", "#7b6cf6", "#3dd6d0"];
      for (i = 0; i < 14; i++) { x.fillStyle = cs[i % 4]; x.globalAlpha = .85; x.beginPath(); x.arc((i * 137) % w, (i * 89) % h, 30 + (i * 23) % 70, 0, 7); x.fill(); }
      x.globalAlpha = 1;
    } else {
      g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#bfe6ff"); g.addColorStop(1, "#eaf7ff"); x.fillStyle = g; x.fillRect(0, 0, w, h);
      [["#7cc47f", .55], ["#4f9a5c", .68], ["#2f6b45", .82]].forEach(function (l, j) {
        x.fillStyle = l[0]; x.beginPath(); x.moveTo(0, h); for (var k = 0; k <= w; k += 10) x.lineTo(k, h * l[1] - Math.sin(k / (90 + j * 30) + j) * h * .07); x.lineTo(w, h); x.fill();
      });
    }
    return c;
  }

  window.S3_DEMO = function () {
    st.count = 4; st.tpl = 1; st.size = 0; st.gap = 14; st.radius = 16; st.bg = "#ffffff";
    $$("#count button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === "4")); }); tplButtons();
    $("#gap").value = 14; $("#radius").value = 16; labels();
    [[900, 1100], [800, 600], [800, 600], [800, 600]].forEach(function (d, i) { photos[i] = { img: art(i, d[0], d[1]), w: d[0], h: d[1], zoom: 1, px: 0.5, py: 0.5 }; });
    sel = 0; draw();
  };

  window.S3_SELFTEST = function () {
    var r = cellRects(grid(2, 2), 1000, 1000, 20), ok = true;
    ok = ok && r[0].x === 20 && r[0].y === 20 && r[0].w === 470 && r[0].h === 470 && r[1].x === 510 && r[3].x === 510 && r[3].y === 510 && r[3].w === 470;
    // every layout: right count, inside the unit square, no overlaps, full coverage
    Object.keys(TPL).forEach(function (n) {
      TPL[n].forEach(function (t) {
        var cs = t[1], area = 0;
        ok = ok && cs.length === +n;
        cs.forEach(function (a, i) {
          area += a[2] * a[3];
          ok = ok && a[0] > -EPS && a[1] > -EPS && a[0] + a[2] < 1 + EPS && a[1] + a[3] < 1 + EPS;
          cs.forEach(function (b, j) {
            if (j <= i) return;
            var ix = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
            if (ix > 1e-6 && iy > 1e-6) ok = false;
          });
        });
        ok = ok && Math.abs(area - 1) < 1e-6;
      });
    });
    var d = place({ w: 200, h: 100, zoom: 1, px: 0.5, py: 0.5 }, { x: 0, y: 0, w: 100, h: 100 });
    ok = ok && d.w === 200 && d.h === 100 && d.x === -50 && d.y === 0;
    var d2 = place({ w: 200, h: 100, zoom: 2, px: 0, py: 1 }, { x: 0, y: 0, w: 100, h: 100 });
    ok = ok && d2.w === 400 && d2.x === 0 && d2.y === -100;
    // full render: red left, blue right, white gap
    var keep = { st: Object.assign({}, st), photos: photos.slice() };
    function solid(col) { var c = document.createElement("canvas"); c.width = 10; c.height = 10; var x = c.getContext("2d"); x.fillStyle = col; x.fillRect(0, 0, 10, 10); return c; }
    Object.assign(st, { count: 2, tpl: 0, gap: 10, radius: 0, bg: "#ffffff" });
    photos = [{ img: solid("#ff0000"), w: 10, h: 10, zoom: 1, px: .5, py: .5 }, { img: solid("#0000ff"), w: 10, h: 10, zoom: 1, px: .5, py: .5 }].concat(new Array(7).fill(null));
    var c = document.createElement("canvas"); render(c, 200, 100, false);
    var x = c.getContext("2d"), L = x.getImageData(50, 50, 1, 1).data, R = x.getImageData(150, 50, 1, 1).data, G = x.getImageData(0, 0, 1, 1).data;
    st = keep.st; photos = keep.photos;
    return ok && L[0] === 255 && L[2] === 0 && R[2] === 255 && R[0] === 0 && G[0] === 255 && G[1] === 255 && G[2] === 255;
  };
})();
