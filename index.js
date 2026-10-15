import { jsPDF } from "jspdf";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./cv_data.json", import.meta.url), "utf8"));

const PAGE_W = 210;
const PAGE_H = 297;
const SIDE_W = 66;
const SIDE_IN = SIDE_W - 20;
const MAIN_X = SIDE_W + 10;
const MAIN_W = PAGE_W - MAIN_X - 10;

const C = {
    navy: [24, 36, 58],
    accent: [0, 150, 160],
    text: [40, 44, 52],
    muted: [110, 118, 130],
    light: [235, 239, 244],
    white: [255, 255, 255],
    sideText: [190, 200, 215],
};
const CAT_COLORS = {
    low_level: [220, 90, 60],
    high_level: [60, 120, 200],
    server: [0, 150, 160],
    DB: [140, 90, 190],
    other: [150, 156, 166],
};
const CAT_LABELS = {
    low_level: "Low level",
    high_level: "High level",
    server: "Server",
    DB: "Databases",
    other: "Other",
};
const LANG_NAMES = { fr: "French", de: "German", en: "English" };

const fill = (doc, c) => doc.setFillColor(...c);
const color = (doc, c) => doc.setTextColor(...c);
const tint = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));
// Fields still set to "TODO" are not printed.
const ok = (v) => typeof v === "string" && v.trim() !== "" && v.trim() !== "TODO";
const pretty = (s) => s.replace(/Cpp/g, "C++");

// ---------- Graph model: project -> library -> language ----------
function buildGraph() {
    // Known skill entries, keyed by "lang" or "lang:lib" (lowercase).
    const skills = new Map();
    const baseCat = new Map();
    const canon = new Map();
    for (const [cat, group] of Object.entries(data.IT_langs)) {
        for (const [key, level] of Object.entries(group)) {
            skills.set(key.toLowerCase(), { level, cat, key });
            const [base, lib] = key.split(":");
            canon.set(base.toLowerCase(), base);
            if (lib) canon.set(key.toLowerCase(), key);
            if (!baseCat.has(base.toLowerCase())) baseCat.set(base.toLowerCase(), cat);
        }
    }

    const nodes = [];
    const nodeMap = new Map();
    const usedKeys = new Set();
    const edges = [];

    const getLang = (base) => {
        const k = base.toLowerCase();
        if (!nodeMap.has(k)) {
            const s = skills.get(k);
            const n = {
                kind: "lang",
                label: pretty(canon.get(k) ?? base),
                level: s?.level ?? 0,
                cat: baseCat.get(k) ?? "other",
            };
            n.r = n.level ? 2.2 + n.level * 0.55 : 4;
            nodeMap.set(k, n);
            nodes.push(n);
        }
        return nodeMap.get(k);
    };
    const getLib = (base, lib) => {
        const k = `${base}:${lib}`.toLowerCase();
        if (!nodeMap.has(k)) {
            const s = skills.get(k);
            const lang = getLang(base);
            const n = {
                kind: "lib",
                label: pretty(lib),
                level: s?.level ?? 0,
                cat: s?.cat ?? lang.cat,
            };
            n.r = n.level ? 2 + n.level * 0.4 : 2.8;
            nodeMap.set(k, n);
            nodes.push(n);
            edges.push([n, lang]);
        }
        return nodeMap.get(k);
    };

    for (const list of Object.values(data.projects)) {
        for (const p of list) {
            const targets = new Set();
            for (const raw of (p.lang ?? []).filter(Boolean)) {
                const [base, lib] = raw.split(":");
                const b = canon.get(base.toLowerCase()) ?? base;
                usedKeys.add(b.toLowerCase());
                if (lib) {
                    usedKeys.add(`${b}:${lib}`.toLowerCase());
                    targets.add(getLib(b, lib));
                } else {
                    targets.add(getLang(b));
                }
            }
            if (!targets.size) continue;
            const pn = { kind: "project", label: p.name, r: 1.4 };
            nodes.push(pn);
            for (const t of targets) edges.push([pn, t]);
        }
    }
    return { nodes, edges, usedKeys };
}

// Deterministic force-directed layout inside a w x h box.
function layout({ nodes, edges }, w, h) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    nodes.forEach((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2;
        n.x = w / 2 + Math.cos(a) * w * 0.3 + (rnd() - 0.5) * 4;
        n.y = h / 2 + Math.sin(a) * h * 0.3 + (rnd() - 0.5) * 4;
    });
    for (let it = 0; it < 1200; it++) {
        const cool = 1 - it / 1200;
        for (const a of nodes) { a.fx = (w / 2 - a.x) * 0.01; a.fy = (h / 2 - a.y) * 0.01; }
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                let dx = a.x - b.x, dy = a.y - b.y;
                const d = Math.max(Math.hypot(dx, dy), 0.1);
                const minD = a.r + b.r + 13;
                const f = 90 / (d * d) + (d < minD ? (minD - d) * 0.5 : 0);
                dx /= d; dy /= d;
                a.fx += dx * f; a.fy += dy * f;
                b.fx -= dx * f; b.fy -= dy * f;
            }
        }
        for (const [a, b] of edges) {
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.max(Math.hypot(dx, dy), 0.1);
            const f = (d - (a.r + b.r + 10)) * 0.03;
            a.fx += (dx / d) * f; a.fy += (dy / d) * f;
            b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
        }
        for (const n of nodes) {
            n.x += Math.max(-3, Math.min(3, n.fx)) * cool;
            n.y += Math.max(-3, Math.min(3, n.fy)) * cool;
            const padX = Math.max(n.r + 4, n.kind === "project" ? 12 : 0);
            const padY = n.r + 8;
            n.x = Math.max(padX, Math.min(w - padX, n.x));
            n.y = Math.max(padY, Math.min(h - padY - 6, n.y));
        }
    }
}

// ---------- Drawing helpers ----------
function drawSidebar(doc) {
    fill(doc, C.navy);
    doc.rect(0, 0, SIDE_W, PAGE_H, "F");
}

function sideTitle(doc, text, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    color(doc, C.white);
    doc.text(text.toUpperCase(), 10, y);
    fill(doc, C.accent);
    doc.rect(10, y + 2, 12, 0.8, "F");
    return y + 9;
}

function mainTitle(doc, text, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    color(doc, C.navy);
    const up = text.toUpperCase();
    doc.text(up, MAIN_X, y);
    const tw = doc.getTextWidth(up);
    fill(doc, C.accent);
    doc.rect(MAIN_X, y + 2, 12, 0.8, "F");
    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.3);
    doc.line(MAIN_X + tw + 3, y - 1.2, MAIN_X + MAIN_W, y - 1.2);
    return y + 8.5;
}

function drawGraph(doc, g, x0, y0, w, h) {
    layout(g, w, h);

    fill(doc, [248, 250, 252]);
    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.3);
    doc.roundedRect(x0, y0, w, h, 2, 2, "FD");

    doc.setLineWidth(0.25);
    for (const [a, b] of g.edges) {
        const owner = a.kind === "project" ? b : a;
        doc.setDrawColor(...CAT_COLORS[owner.cat]);
        doc.line(x0 + a.x, y0 + a.y, x0 + b.x, y0 + b.y);
    }

    const order = { project: 0, lib: 1, lang: 2 };
    for (const n of [...g.nodes].sort((a, b) => order[a.kind] - order[b.kind])) {
        const x = x0 + n.x, y = y0 + n.y;
        if (n.kind === "project") {
            fill(doc, C.white);
            doc.setDrawColor(...C.navy);
            doc.setLineWidth(0.4);
            doc.circle(x, y, n.r, "FD");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(5.5);
            color(doc, C.muted);
            doc.text(n.label, x, y + n.r + 2.6, { align: "center" });
            continue;
        }
        const col = CAT_COLORS[n.cat];
        const isLib = n.kind === "lib";
        fill(doc, isLib ? tint(col, 0.75) : col);
        doc.setDrawColor(...(isLib ? col : C.white));
        doc.setLineWidth(isLib ? 0.5 : 0.6);
        doc.circle(x, y, n.r, "FD");
        doc.setFont("helvetica", "bold");
        const fs = isLib ? 5.5 : n.r > 5 ? 8 : 6.5;
        doc.setFontSize(fs);
        const inside = doc.getTextWidth(n.label) < n.r * 2 - 0.8;
        color(doc, inside ? (isLib ? C.text : C.white) : C.text);
        if (inside) doc.text(n.label, x, y + fs * 0.12, { align: "center" });
        else doc.text(n.label, x, y - n.r - 1.2, { align: "center" });
    }

    let lx = x0 + 4;
    const ly = y0 + h - 3.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    const used = new Set(g.nodes.map((n) => n.cat).filter(Boolean));
    for (const cat of Object.keys(CAT_LABELS).filter((c) => used.has(c))) {
        fill(doc, CAT_COLORS[cat]);
        doc.circle(lx, ly - 0.8, 1, "F");
        color(doc, C.muted);
        doc.text(CAT_LABELS[cat], lx + 2, ly);
        lx += doc.getTextWidth(CAT_LABELS[cat]) + 9;
    }
    doc.setDrawColor(...C.navy);
    fill(doc, C.white);
    doc.setLineWidth(0.3);
    doc.circle(lx, ly - 0.8, 1, "FD");
    color(doc, C.muted);
    doc.text("Project", lx + 2, ly);
    lx += doc.getTextWidth("Project") + 6;
    fill(doc, tint(CAT_COLORS.server, 0.75));
    doc.setDrawColor(...CAT_COLORS.server);
    doc.circle(lx, ly - 0.8, 1, "FD");
    doc.text("Library", lx + 2, ly);
    lx += doc.getTextWidth("Library") + 6;
    doc.text("Node size = proficiency", lx, ly);
}

function wrap(doc, text, x, y, width, lh) {
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, x, y);
    return y + lines.length * lh;
}

// ---------- Document ----------
function generateCV() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setProperties({ title: `CV - ${data.name} ${data.fammily_name}` });
    drawSidebar(doc);
    const graph = buildGraph();

    // Sidebar
    let y = 24;
    if (ok(data.picture)) {
        const img = readFileSync(new URL(data.picture, import.meta.url));
        const { width, height } = doc.getImageProperties(img);
        const d = 34;
        const s = Math.max(d / width, d / height);
        const cx = SIDE_W / 2, cy = 10 + d / 2;
        doc.saveGraphicsState();
        doc.circle(cx, cy, d / 2, null);
        doc.clip();
        doc.discardPath();
        doc.addImage(img, cx - (width * s) / 2, cy - (height * s) / 2, width * s, height * s);
        doc.restoreGraphicsState();
        doc.setDrawColor(...C.accent);
        doc.setLineWidth(0.8);
        doc.circle(cx, cy, d / 2, "S");
        y = 56;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    color(doc, C.white);
    doc.text(data.name, 10, y);
    doc.text(data.fammily_name.toUpperCase(), 10, y + 9);
    fill(doc, C.accent);
    doc.rect(10, y + 13, 20, 1.2, "F");
    if (ok(data.title)) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        color(doc, C.sideText);
        doc.text(data.title, 10, y + 21);
    }
    y += 34;

    const contact = Object.values(data.contact ?? {}).filter((c) => ok(c.text));
    if (contact.length) {
        y = sideTitle(doc, "Contact", y);
        for (const c of contact) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            color(doc, C.white);
            const lines = doc.splitTextToSize(c.text, SIDE_IN);
            if (ok(c.url)) doc.textWithLink(lines[0], 10, y, { url: c.url });
            else doc.text(lines[0], 10, y);
            if (lines.length > 1) doc.text(lines.slice(1), 10, y + 3.6);
            y += lines.length * 3.6;
            if (ok(c.description)) {
                doc.setFontSize(6.8);
                color(doc, [150, 215, 220]);
                y = wrap(doc, c.description, 10, y, SIDE_IN, 3);
            }
            y += 2;
        }
        y += 3;
    }

    y = sideTitle(doc, "Languages", y);
    for (const [code, level] of Object.entries(data.langs)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        color(doc, C.white);
        doc.text(LANG_NAMES[code] ?? code, 10, y);
        doc.setFont("helvetica", "normal");
        color(doc, [150, 215, 220]);
        doc.text(level, SIDE_W - 10, y, { align: "right" });
        y += 5.5;
    }
    y += 4;

    y = sideTitle(doc, "Skills", y);
    for (const [cat, group] of Object.entries(data.IT_langs)) {
        const shown = Object.entries(group).filter(([k]) => graph.usedKeys.has(k.toLowerCase()));
        if (!shown.length) continue;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        color(doc, CAT_COLORS[cat]);
        doc.text(CAT_LABELS[cat].toUpperCase(), 10, y);
        y += 5;
        for (const [key, level] of shown) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            color(doc, C.white);
            doc.text(pretty(key.split(":").pop()), 10, y);
            fill(doc, [55, 70, 95]);
            doc.roundedRect(38, y - 2.2, 18, 2, 1, 1, "F");
            fill(doc, CAT_COLORS[cat]);
            doc.roundedRect(38, y - 2.2, 18 * (level / 10), 2, 1, 1, "F");
            y += 5.5;
        }
        y += 3;
    }
    y += 3;

    y = sideTitle(doc, "Education", y);
    for (const s of data.studys) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        color(doc, C.white);
        y = wrap(doc, s.name, 10, y, SIDE_IN, 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        color(doc, [150, 215, 220]);
        doc.text(`${s.entry} - ${ok(s.finished) ? s.finished : "present"}`, 10, y + 0.5);
        y += 4.5;
        color(doc, C.sideText);
        if (ok(s.diplomat)) {
            doc.setFont("helvetica", "bold");
            y = wrap(doc, s.diplomat, 10, y, SIDE_IN, 3.4);
            doc.setFont("helvetica", "normal");
        }
        if (ok(s.description)) y = wrap(doc, s.description, 10, y, SIDE_IN, 3.4);
        if (ok(s.link)) {
            color(doc, [150, 215, 220]);
            doc.textWithLink(s.link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), 10, y + 0.5, { url: s.link });
            y += 3.5;
        }
        y += 5;
    }

    // const interests = (data.interests ?? []).filter(ok);
    // if (interests.length) {
    //     y = sideTitle(doc, "Interests", y + 2);
    //     doc.setFont("helvetica", "normal");
    //     doc.setFontSize(8);
    //     color(doc, C.white);
    //     wrap(doc, interests.join(", "), 10, y, SIDE_IN, 3.8);
    // }

    // Main
    y = 24;
    if (ok(data.summary)) {
        y = mainTitle(doc, "Profile", y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        color(doc, C.text);
        y = wrap(doc, data.summary, MAIN_X, y, MAIN_W, 4) + 6;
    }

    const jobs = (data.experience ?? []).filter((e) => ok(e.title));
    if (jobs.length) {
        y = mainTitle(doc, "Experience", y);
        for (const e of jobs) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            color(doc, C.text);
            doc.text([e.title, e.company].filter(ok).join(" - "), MAIN_X, y);
            if (ok(e.period)) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                color(doc, C.accent);
                doc.text(e.period, MAIN_X + MAIN_W, y, { align: "right" });
            }
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            color(doc, C.muted);
            if (ok(e.description)) y = wrap(doc, e.description, MAIN_X, y, MAIN_W, 3.5);
            y += 4;
        }
    }

    // y = mainTitle(doc, "Technical skills", y);
    // for (const [label, items] of Object.entries(data.skill_groups ?? {})) {
    //     doc.setFont("helvetica", "bold");
    //     doc.setFontSize(8.5);
    //     color(doc, C.navy);
    //     doc.text(label, MAIN_X, y);
    //     doc.setFont("helvetica", "normal");
    //     color(doc, C.text);
    //     y = wrap(doc, items.join("  |  "), MAIN_X + 24, y, MAIN_W - 24, 4) + 1.5;
    // }
    // y += 5;

    y = mainTitle(doc, "Project map", y);
    const gh = 72;
    drawGraph(doc, graph, MAIN_X, y, MAIN_W, gh);
    y += gh + 9;

    const all = Object.values(data.projects).flat();
    const sections = [
        ["Featured projects", all.filter((p) => p.featured), true],
        ["Other projects", all.filter((p) => !p.featured), false],
    ];
    for (const [title, list, big] of sections) {
        if (!list.length) continue;
        y = mainTitle(doc, title, y);
        for (const p of list) {
            const desc = p.description ?? "";
            const tags = big ? (p.lang ?? []).filter(Boolean).map((l) => pretty(l).replace(":", " / ")).join(", ") : "";
            const meta = [p.year, p.role, p.client && `client: ${p.client}`, tags].filter(ok).join(" | ");
            const reserve = ok(p.link) ? 9 : 0;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(big ? 8.8 : 8);
            const nameW = doc.getTextWidth(p.name);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(big ? 7.5 : 7.2);
            let first = "";
            let rest = [];
            if (big) {
                rest = doc.splitTextToSize(desc, MAIN_W - 3);
            } else {
                first = doc.splitTextToSize(desc, MAIN_W - nameW - 3 - reserve)[0] ?? "";
                const remaining = desc.slice(first.length).trim();
                rest = remaining ? doc.splitTextToSize(remaining, MAIN_W - 3) : [];
            }
            const h = (big ? 7 : 3.6) + rest.length * 3.1 + (big ? 2.6 : 1.4);
            if (y + h > PAGE_H - 8) {
                doc.addPage();
                drawSidebar(doc);
                y = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(big ? 8.8 : 8);
            color(doc, C.text);
            doc.text(p.name, MAIN_X, y);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            if (ok(p.link)) {
                color(doc, C.accent);
                doc.textWithLink("link", MAIN_X + MAIN_W, y, { url: p.link, align: "right" });
            }
            doc.setFontSize(big ? 7.5 : 7.2);
            color(doc, C.muted);
            if (big) {
                if (meta) {
                    doc.setFontSize(7);
                    color(doc, C.accent);
                    doc.text(meta, MAIN_X, y + 3.4);
                    color(doc, C.muted);
                    doc.setFontSize(7.5);
                }
                y += meta ? 7 : 3.6;
            } else {
                if (first) doc.text(first, MAIN_X + nameW + 2, y);
                y += 3.6;
            }
            if (rest.length) doc.text(rest, MAIN_X, y - (big ? 0.4 : 0));
            y += rest.length * 3.1 + (big ? 2.6 : 1.4) - (big ? 0 : 0);
        }
        y += 3;
    }

    doc.save("cv.pdf");
}

generateCV();
