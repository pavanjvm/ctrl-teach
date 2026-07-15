#!/usr/bin/env python3
"""Create the Ctrl+Teach / Tars hackathon pitch deck.

This writes a simple editable PowerPoint file directly with Open XML so the
repo does not need an extra presentation dependency.
"""

from __future__ import annotations

import html
import zipfile
from datetime import datetime, timezone
from pathlib import Path


OUT = Path("CtrlTeach_Tars_Hackathon_Pitch.pptx")
EMU_PER_INCH = 914400
SLIDE_W = int(13.333333 * EMU_PER_INCH)
SLIDE_H = int(7.5 * EMU_PER_INCH)


COLORS = {
    "navy": "0F172A",
    "navy2": "111827",
    "cream": "FFF7ED",
    "white": "FFFFFF",
    "muted": "64748B",
    "slate": "334155",
    "blue": "2563EB",
    "cyan": "22D3EE",
    "green": "22C55E",
    "orange": "F97316",
    "amber": "F59E0B",
    "rose": "FB7185",
    "purple": "8B5CF6",
    "line": "CBD5E1",
    "panel": "F8FAFC",
}


def emu(inches: float) -> int:
    return int(inches * EMU_PER_INCH)


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def text_runs(text: str, size: int, color: str, bold: bool = False, font: str = "Aptos") -> str:
    bold_attr = ' b="1"' if bold else ""
    return (
        f'<a:r><a:rPr lang="en-US" sz="{size}"{bold_attr}>'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        f'<a:latin typeface="{font}"/></a:rPr><a:t>{esc(text)}</a:t></a:r>'
    )


def paragraph(
    text: str,
    size: int = 2400,
    color: str = COLORS["slate"],
    bold: bool = False,
    align: str | None = None,
    bullet: bool = False,
    spacing_after: int = 800,
) -> str:
    ppr_parts = []
    if align:
        ppr_parts.append(f'algn="{align}"')
    ppr_attr = f' {" ".join(ppr_parts)}' if ppr_parts else ""
    bullet_xml = ""
    if bullet:
        bullet_xml = '<a:buChar char="•"/>'
    return (
        f"<a:p><a:pPr{ppr_attr}>{bullet_xml}</a:pPr>"
        f"{text_runs(text, size, color, bold)}"
        f'<a:endParaRPr lang="en-US" sz="{size}"/></a:p>'
    )


def textbox(
    shape_id: int,
    name: str,
    x: float,
    y: float,
    w: float,
    h: float,
    paras: list[str],
    fill: str | None = None,
    line: str | None = None,
    radius: bool = False,
    margin: int = 91440,
) -> str:
    geom = "roundRect" if radius else "rect"
    fill_xml = (
        f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
    )
    line_xml = (
        f'<a:ln w="12700"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
        if line
        else '<a:ln><a:noFill/></a:ln>'
    )
    return f"""
      <p:sp>
        <p:nvSpPr><p:cNvPr id="{shape_id}" name="{esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
          <a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>
          {fill_xml}
          {line_xml}
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" lIns="{margin}" tIns="{margin}" rIns="{margin}" bIns="{margin}"/>
          <a:lstStyle/>
          {''.join(paras)}
        </p:txBody>
      </p:sp>
    """


def rect(
    shape_id: int,
    name: str,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: str,
    line: str | None = None,
    radius: bool = False,
    dashed: bool = False,
    alpha: int | None = None,
) -> str:
    geom = "roundRect" if radius else "rect"
    alpha_xml = f'<a:alpha val="{alpha}"/>' if alpha is not None else ""
    line_xml = ""
    if line:
        dash_xml = '<a:prstDash val="dash"/>' if dashed else ""
        line_xml = (
            f'<a:ln w="19050"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill>'
            f"{dash_xml}</a:ln>"
        )
    else:
        line_xml = '<a:ln><a:noFill/></a:ln>'
    return f"""
      <p:sp>
        <p:nvSpPr><p:cNvPr id="{shape_id}" name="{esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
          <a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="{fill}">{alpha_xml}</a:srgbClr></a:solidFill>
          {line_xml}
        </p:spPr>
      </p:sp>
    """


def placeholder(
    shape_id: int,
    title: str,
    subtitle: str,
    x: float,
    y: float,
    w: float,
    h: float,
) -> str:
    return textbox(
        shape_id,
        f"Placeholder - {title}",
        x,
        y,
        w,
        h,
        [
            paragraph(title, 2200, COLORS["blue"], True, "ctr"),
            paragraph(subtitle, 1550, COLORS["muted"], False, "ctr"),
        ],
        fill=COLORS["panel"],
        line=COLORS["line"],
        radius=True,
        margin=emu(0.15),
    )


def title_block(title: str, subtitle: str | None = None, dark: bool = False) -> str:
    color = COLORS["white"] if dark else COLORS["navy"]
    sub_color = "CBD5E1" if dark else COLORS["muted"]
    paras = [paragraph(title, 3900, color, True)]
    if subtitle:
        paras.append(paragraph(subtitle, 1850, sub_color))
    return textbox(10, "Title", 0.55, 0.45, 11.9, 1.1, paras, margin=0)


def pill(shape_id: int, text: str, x: float, y: float, w: float, color: str) -> str:
    return textbox(
        shape_id,
        f"Pill - {text}",
        x,
        y,
        w,
        0.38,
        [paragraph(text, 1300, COLORS["white"], True, "ctr")],
        fill=color,
        line=color,
        radius=True,
        margin=emu(0.05),
    )


def slide_xml(shapes: str, bg: str = COLORS["cream"]) -> str:
    background = rect(2, "Background", 0, 0, 13.333333, 7.5, bg)
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {background}
      {shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>'''


def slide_cover() -> str:
    shapes = ""
    shapes += rect(3, "Dark hero", 0, 0, 13.333333, 7.5, COLORS["navy"])
    shapes += rect(4, "Glow cyan", 8.4, -0.4, 4.8, 4.8, COLORS["cyan"], radius=True, alpha=16000)
    shapes += rect(5, "Glow purple", -1.2, 4.8, 4.8, 3.4, COLORS["purple"], radius=True, alpha=18000)
    shapes += textbox(
        6,
        "Hero title",
        0.7,
        1.2,
        7.7,
        2.6,
        [
            paragraph("Ctrl+Teach", 5900, COLORS["white"], True),
            paragraph("Meet Tars — the AI tutor that lives next to your cursor.", 2450, "CBD5E1"),
        ],
        margin=0,
    )
    shapes += textbox(
        7,
        "Hero note",
        0.75,
        4.55,
        5.95,
        0.95,
        [
            paragraph(
                "We generate courses too, but that’s the usual part now. The unusual part is the tutor we ship with them.",
                1900,
                COLORS["cream"],
                False,
            )
        ],
        fill="1E293B",
        line="334155",
        radius=True,
    )
    shapes += placeholder(
        8,
        "Hero screenshot / Tars next to cursor",
        "Drop a clean product screenshot here",
        7.15,
        1.65,
        5.25,
        4.7,
    )
    shapes += pill(9, "Hackathon pitch", 0.75, 6.55, 2.05, COLORS["blue"])
    return slide_xml(shapes, bg=COLORS["navy"])


def slide_problem() -> str:
    shapes = title_block(
        "The problem: training still feels stuck in the old model",
        "Cprime has always been a learning company — but the current model still leans heavily on human trainers, live sessions, and static material.",
    )
    cards = [
        ("Human trainers don’t scale", "Great trainers are expensive, scheduled, and limited to one room or call at a time.", COLORS["rose"]),
        ("Tools change too fast", "AWS, Jira, ServiceNow, GitHub and Power BI keep moving. Screenshots and instructions go stale.", COLORS["orange"]),
        ("Learners get stuck alone", "The moment the trainer leaves, people jump between docs, ChatGPT, screenshots, and guesswork.", COLORS["blue"]),
    ]
    x = 0.75
    for i, (head, body, color) in enumerate(cards):
        shapes += textbox(
            20 + i,
            head,
            x + i * 4.15,
            2.25,
            3.7,
            3.2,
            [
                paragraph(head, 2450, color, True),
                paragraph(body, 1750, COLORS["slate"]),
            ],
            fill=COLORS["white"],
            line="E2E8F0",
            radius=True,
        )
    shapes += textbox(
        30,
        "Bottom punch",
        1.15,
        6.1,
        11.1,
        0.65,
        [paragraph("The world is moving faster than classroom schedules.", 2300, COLORS["navy"], True, "ctr")],
        fill="FFE7D6",
        line="FED7AA",
        radius=True,
    )
    return slide_xml(shapes)


def slide_aws_story() -> str:
    shapes = title_block(
        "A real example: getting lost inside AWS",
        "During training, we had to create an EC2 instance and deploy our app. The trainer showed it once — then we forgot what to click.",
    )
    shapes += textbox(
        20,
        "Story text",
        0.75,
        1.95,
        5.55,
        4.65,
        [
            paragraph("What actually happens:", 2300, COLORS["navy"], True),
            paragraph("You jump from AWS to ChatGPT.", 1750, COLORS["slate"], bullet=True),
            paragraph("ChatGPT says “the button is on the top left.”", 1750, COLORS["slate"], bullet=True),
            paragraph("But AWS already changed the UI.", 1750, COLORS["slate"], bullet=True),
            paragraph("Now you’re taking screenshots, asking again, and losing momentum.", 1750, COLORS["slate"], bullet=True),
        ],
        fill=COLORS["white"],
        line="E2E8F0",
        radius=True,
    )
    shapes += placeholder(
        21,
        "Screenshot space: AWS console confusion",
        "Add an AWS Console screenshot with a “where do I click?” moment",
        6.8,
        1.75,
        5.55,
        4.95,
    )
    shapes += pill(22, "The pain is not content. It’s navigation + confidence.", 1.05, 6.78, 5.5, COLORS["orange"])
    return slide_xml(shapes)


def slide_meet_tars() -> str:
    shapes = title_block(
        "Meet Tars",
        "A small tutor that lives right next to your cursor and helps the moment you’re lost.",
    )
    shapes += textbox(
        20,
        "Meet text",
        0.75,
        1.9,
        5.35,
        4.75,
        [
            paragraph("Instead of leaving the learner to figure it out alone, Tars stays with them on the page.", 2050, COLORS["slate"]),
            paragraph("Hold Ctrl, point at the confusing part, and ask naturally:", 1950, COLORS["navy"], True),
            paragraph("“Where is the launch instance button?”", 1850, COLORS["blue"], True),
            paragraph("Tars understands the screen, points to the right place, and explains what to do next.", 1950, COLORS["slate"]),
        ],
        fill=COLORS["white"],
        line="E2E8F0",
        radius=True,
    )
    shapes += placeholder(
        21,
        "Screenshot space: Tars beside cursor",
        "Show Tars floating near the cursor",
        6.65,
        1.75,
        5.7,
        4.95,
    )
    return slide_xml(shapes)


def slide_capabilities() -> str:
    shapes = title_block(
        "What makes Tars feel different",
        "It is not just a chat box next to a course. It can see the workspace, talk through it, and act with the learner.",
    )
    caps = [
        ("Point", "Shows exactly where something is on the screen.", COLORS["blue"]),
        ("Draw", "Draws on top of the browser to explain visually.", COLORS["orange"]),
        ("Circle to ask", "Learner circles/underlines something and Tars understands the region.", COLORS["purple"]),
        ("Browser actions", "Can scroll, switch tabs, navigate, and guide real workflows.", COLORS["green"]),
    ]
    for i, (head, body, color) in enumerate(caps):
        row = i // 2
        col = i % 2
        shapes += textbox(
            30 + i,
            head,
            0.75 + col * 6.15,
            1.8 + row * 2.25,
            5.65,
            1.75,
            [
                paragraph(head, 2500, color, True),
                paragraph(body, 1700, COLORS["slate"]),
            ],
            fill=COLORS["white"],
            line="E2E8F0",
            radius=True,
        )
    shapes += placeholder(
        40,
        "Screenshot strip: point / draw / circle",
        "Drop 2–3 small screenshots of Tars capabilities here",
        0.95,
        6.25,
        11.45,
        0.82,
    )
    return slide_xml(shapes)


def slide_browser_labs() -> str:
    shapes = title_block(
        "Courses become hands-on, not just readable",
        "When a lesson is about a real web platform, Ctrl+Teach can launch a browser lab right after it.",
    )
    shapes += textbox(
        20,
        "Lab list",
        0.75,
        1.85,
        5.8,
        4.75,
        [
            paragraph("Example lab:", 2300, COLORS["navy"], True),
            paragraph("Open AWS Console", 1750, COLORS["slate"], bullet=True),
            paragraph("Create an EC2 instance", 1750, COLORS["slate"], bullet=True),
            paragraph("Deploy the sample app", 1750, COLORS["slate"], bullet=True),
            paragraph("Tars watches progress and helps only when needed", 1750, COLORS["slate"], bullet=True),
            paragraph("Completion is verified after the task and cleanup are done", 1750, COLORS["slate"], bullet=True),
        ],
        fill=COLORS["white"],
        line="E2E8F0",
        radius=True,
    )
    shapes += placeholder(
        21,
        "Screenshot space: Browser lab",
        "Show AWS / Jira / GitHub lab with Tars guidance",
        6.9,
        1.75,
        5.45,
        4.95,
    )
    return slide_xml(shapes)


def slide_modes() -> str:
    shapes = title_block(
        "Two ways to learn",
        "Same tutor, different intensity depending on what the learner needs.",
    )
    shapes += textbox(
        20,
        "Text mode",
        0.85,
        1.85,
        5.55,
        4.55,
        [
            paragraph("1. Regular text mode", 2850, COLORS["blue"], True),
            paragraph("For normal course lessons, explanations, quick questions, summaries, quizzes, and self-paced study.", 1850, COLORS["slate"]),
            paragraph("Good for: “Explain this concept again.”", 1750, COLORS["muted"]),
        ],
        fill=COLORS["white"],
        line="BFDBFE",
        radius=True,
    )
    shapes += textbox(
        21,
        "Classroom mode",
        6.95,
        1.85,
        5.55,
        4.55,
        [
            paragraph("2. Live Classroom Mode", 2850, COLORS["orange"], True),
            paragraph("Voice + whiteboard + screen guidance. This is the Cprime classroom feeling, but with an AI tutor instead of a scheduled human trainer.", 1850, COLORS["slate"]),
            paragraph("Good for: “Show me where to click.”", 1750, COLORS["muted"]),
        ],
        fill=COLORS["white"],
        line="FED7AA",
        radius=True,
    )
    shapes += placeholder(
        22,
        "Screenshot space: Classroom / whiteboard mode",
        "Add whiteboard mode screenshot here",
        3.15,
        6.55,
        7.0,
        0.55,
    )
    return slide_xml(shapes)


def slide_cprime_impact() -> str:
    shapes = title_block(
        "Why this matters for Cprime",
        "Cprime already knows learning. Tars is the way to make that learning scale without making it feel cold.",
    )
    items = [
        ("Less dependency on live trainers", "Human experts can focus on high-value coaching while Tars handles repeatable guidance."),
        ("Faster training for fast-changing tools", "New workflows can be taught as soon as the market changes."),
        ("More hands-on practice", "Learners do the thing inside the real product, not just watch someone else do it."),
        ("Better proof of learning", "Labs, progress, and evidence show what the learner actually completed."),
    ]
    for i, (head, body) in enumerate(items):
        shapes += textbox(
            30 + i,
            head,
            0.8 + (i % 2) * 6.05,
            1.8 + (i // 2) * 2.15,
            5.55,
            1.65,
            [
                paragraph(head, 2200, COLORS["navy"], True),
                paragraph(body, 1550, COLORS["slate"]),
            ],
            fill=COLORS["white"],
            line="E2E8F0",
            radius=True,
        )
    shapes += textbox(
        40,
        "Impact line",
        1.2,
        6.2,
        10.95,
        0.75,
        [paragraph("The course is not the product. The tutor is the product.", 2450, COLORS["white"], True, "ctr")],
        fill=COLORS["navy"],
        line=COLORS["navy"],
        radius=True,
    )
    return slide_xml(shapes)


def slide_demo_flow() -> str:
    shapes = title_block(
        "Demo flow",
        "A simple AWS story that makes the value obvious in under two minutes.",
    )
    steps = [
        ("1", "Open EC2 lab", "Learner starts the AWS deployment lab."),
        ("2", "Gets stuck", "They don’t know where the right button moved."),
        ("3", "Hold Ctrl + ask", "They point at the screen and ask Tars."),
        ("4", "Tars guides", "Tars points, draws, scrolls, and explains the next step."),
        ("5", "Verify", "Backend confirms the task and cleanup are done."),
    ]
    for i, (num, head, body) in enumerate(steps):
        x = 0.65 + i * 2.55
        shapes += textbox(
            20 + i,
            f"Step {num}",
            x,
            1.85,
            2.2,
            3.0,
            [
                paragraph(num, 3150, COLORS["blue"], True, "ctr"),
                paragraph(head, 1800, COLORS["navy"], True, "ctr"),
                paragraph(body, 1300, COLORS["slate"], False, "ctr"),
            ],
            fill=COLORS["white"],
            line="E2E8F0",
            radius=True,
        )
    shapes += placeholder(
        30,
        "Screenshot space: end-to-end demo sequence",
        "Add a wide screenshot strip or 3-step collage here",
        1.15,
        5.55,
        11.05,
        1.15,
    )
    return slide_xml(shapes)


def slide_close() -> str:
    shapes = ""
    shapes += rect(3, "Dark close", 0, 0, 13.333333, 7.5, COLORS["navy"])
    shapes += textbox(
        4,
        "Close title",
        0.85,
        1.05,
        11.7,
        2.2,
        [
            paragraph("Ctrl+Teach makes training feel live again.", 5000, COLORS["white"], True, "ctr"),
            paragraph("Not because it generates lessons — because Tars stays with the learner while they actually do the work.", 2250, "CBD5E1", False, "ctr"),
        ],
        margin=0,
    )
    shapes += placeholder(
        5,
        "Final screenshot / product money shot",
        "Drop your strongest Tars screenshot here",
        3.0,
        3.75,
        7.35,
        2.25,
    )
    shapes += pill(6, "Meet Tars", 5.45, 6.55, 2.4, COLORS["blue"])
    return slide_xml(shapes, bg=COLORS["navy"])


SLIDES = [
    slide_cover,
    slide_problem,
    slide_aws_story,
    slide_meet_tars,
    slide_capabilities,
    slide_browser_labs,
    slide_modes,
    slide_cprime_impact,
    slide_demo_flow,
    slide_close,
]


def content_types_xml(slide_count: int) -> str:
    slide_overrides = "\n".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, slide_count + 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  {slide_overrides}
</Types>'''


def root_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''


def app_xml(slide_count: int) -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
  <PresentationFormat>On-screen Show (16:9)</PresentationFormat>
  <Slides>{slide_count}</Slides>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Slides</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>{slide_count}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="{slide_count}" baseType="lpstr">
      {''.join(f'<vt:lpstr>Slide {i}</vt:lpstr>' for i in range(1, slide_count + 1))}
    </vt:vector>
  </TitlesOfParts>
</Properties>'''


def core_xml() -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Ctrl+Teach — Meet Tars</dc:title>
  <dc:creator>Ctrl+Teach</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>'''


def presentation_xml(slide_count: int) -> str:
    slide_ids = "\n".join(
        f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, slide_count + 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>{slide_ids}</p:sldIdLst>
  <p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle>
    <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>
  </p:defaultTextStyle>
</p:presentation>'''


def presentation_rels_xml(slide_count: int) -> str:
    rels = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    ]
    for i in range(1, slide_count + 1):
        rels.append(
            f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {''.join(rels)}
</Relationships>'''


def theme_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CtrlTeach">
  <a:themeElements>
    <a:clrScheme name="CtrlTeach">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="334155"/></a:dk2>
      <a:lt2><a:srgbClr val="FFF7ED"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="F97316"/></a:accent2>
      <a:accent3><a:srgbClr val="22C55E"/></a:accent3>
      <a:accent4><a:srgbClr val="8B5CF6"/></a:accent4>
      <a:accent5><a:srgbClr val="22D3EE"/></a:accent5>
      <a:accent6><a:srgbClr val="FB7185"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="8B5CF6"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="CtrlTeach">
      <a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="CtrlTeach">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>'''


def slide_master_xml() -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>'''


def slide_master_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>'''


def slide_layout_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>'''


def slide_layout_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>'''


def slide_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>'''


def build() -> None:
    slide_xmls = [fn() for fn in SLIDES]
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml(len(slide_xmls)))
        z.writestr("_rels/.rels", root_rels_xml())
        z.writestr("docProps/app.xml", app_xml(len(slide_xmls)))
        z.writestr("docProps/core.xml", core_xml())
        z.writestr("ppt/presentation.xml", presentation_xml(len(slide_xmls)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels_xml(len(slide_xmls)))
        z.writestr("ppt/theme/theme1.xml", theme_xml())
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master_xml())
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", slide_master_rels_xml())
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout_xml())
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slide_layout_rels_xml())
        for i, xml in enumerate(slide_xmls, start=1):
            z.writestr(f"ppt/slides/slide{i}.xml", xml)
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", slide_rels_xml())
    print(f"Wrote {OUT} ({len(slide_xmls)} slides)")


if __name__ == "__main__":
    build()
