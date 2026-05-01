#!/usr/bin/env python3
from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer


def build_report(output_path: Path) -> None:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleMain",
            parent=styles["Title"],
            fontSize=21,
            leading=26,
            textColor=colors.HexColor("#111827"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Subtle",
            parent=styles["Normal"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#6B7280"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontSize=13,
            leading=18,
            textColor=colors.HexColor("#111827"),
            spaceBefore=10,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["Normal"],
            fontSize=10.5,
            leading=15.5,
            textColor=colors.HexColor("#1F2937"),
            alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallLabel",
            parent=styles["Normal"],
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#374151"),
        )
    )

    story = []

    today = date.today().isoformat()
    story.append(Paragraph("Nano Syllabus", styles["TitleMain"]))
    story.append(
        Paragraph(
            "Comprehensive Product Status Report and Forward Plan",
            styles["Heading3"],
        )
    )
    story.append(
        Paragraph(
            f"Generated on {today} | Prepared for Product and Engineering",
            styles["Subtle"],
        )
    )

    story.append(Paragraph("1. Purpose of This Document", styles["Section"]))
    story.append(
        Paragraph(
            (
                "This report captures what Nano Syllabus is being built for, how the app works today, "
                "what has already been completed, what is currently ongoing, and what the next execution "
                "plan is from start to finish. It is designed to align the whole team around one practical "
                "source of truth."
            ),
            styles["Body"],
        )
    )

    story.append(Paragraph("2. What We Are Building", styles["Section"]))
    story.append(
        Paragraph(
            (
                "Nano Syllabus is an AI-powered study assistant for Nepali students (Class 9 to Bachelor), "
                "with bilingual support in English and Roman Nepali. The product aims to provide curriculum-aware "
                "learning help, reduce language friction, and become a trusted daily study companion."
            ),
            styles["Body"],
        )
    )

    story.append(Paragraph("3. Core Product Goals", styles["Section"]))
    goals = [
        "Deliver a reliable student app with real auth, onboarding, persistent AI chat, and revision workflows.",
        "Ground AI responses using official syllabus knowledge (RAG), not generic chat answers.",
        "Keep the experience bilingual (English and Roman Nepali) and context-aware to each student profile.",
        "Build a path from free usage to paid plans through transparent credit and billing flows.",
    ]
    story.append(_bullet_list(goals, styles))

    story.append(Paragraph("4. How the App Works Today (Current Functional Flow)", styles["Section"]))
    now_flow = [
        "User signs up or logs in (email/password or Google OAuth).",
        "User completes onboarding with study profile fields.",
        "User enters chat, asks questions, and receives streamed AI responses.",
        "Each completed assistant response deducts one credit.",
        "User can copy responses, submit thumbs feedback, and use suggested follow-up prompts.",
        "User can save responses as notes, review them later, and run revision mode.",
        "User can browse by subject in Subject Explorer and open/start subject-focused chats.",
    ]
    story.append(_bullet_list(now_flow, styles))

    story.append(Paragraph("5. Completed So Far", styles["Section"]))
    completed = [
        "Core authentication and session flow is functional.",
        "Onboarding and profile persistence are functional.",
        "Persistent chat sessions and history management are functional.",
        "Per-message EN/RN response language selection is functional.",
        "Credits core logic is functional (1 credit per interaction, low-balance warning).",
        "Notes save/edit/delete/detail and revision mode are functional.",
        "Note detail now supports context-prefilled follow-up into chat.",
        "Chat UI utilities (copy, thumbs feedback, suggested follow-ups) are functional.",
    ]
    story.append(_bullet_list(completed, styles))

    story.append(Paragraph("6. What Is Ongoing Right Now", styles["Section"]))
    ongoing = [
        "Real syllabus ingest pipeline execution and data quality checks.",
        "Grounded-answer validation against official syllabus questions.",
        "Subject Explorer depth improvements (filters/sorting/tagging quality).",
        "Rendering improvements for technical/math-heavy study responses.",
    ]
    story.append(_bullet_list(ongoing, styles))

    story.append(Paragraph("7. Remaining Core Gaps (Before Core Is Fully End-to-End)", styles["Section"]))
    remaining = [
        "Official syllabus RAG is not fully validated in live end-to-end usage yet.",
        "Subject Explorer still needs full BRD filter/sort depth and stronger auto-tagging behavior.",
        "Math rendering is improved but still needs full KaTeX-grade fidelity for complex formulas.",
        "Settings area needs BRD-complete polish for password, notification, and usage visibility flows.",
    ]
    story.append(_bullet_list(remaining, styles))

    story.append(Paragraph("8. Next Execution Plan (From Here to 90% Core Completion)", styles["Section"]))
    next_plan = [
        "Task 1: Ingest real syllabus documents (NEB/TU priority subjects) into knowledge tables.",
        "Task 2: Run live grounded QA test set (EN and Roman Nepali) and measure citation relevance.",
        "Task 3: Complete Subject Explorer BRD filters and sorting.",
        "Task 4: Upgrade auto-tagging quality using LLM-based first-message classification.",
        "Task 5: Finalize high-fidelity math rendering and verify in chat and notes.",
    ]
    story.append(_bullet_list(next_plan, styles))

    story.append(Paragraph("9. Product Direction and Why This Matters", styles["Section"]))
    story.append(
        Paragraph(
            (
                "The product direction is to become Nepal's most trusted AI study companion by combining "
                "bilingual UX, curriculum relevance, and practical exam-focused support. The core strategy "
                "is to first make student learning workflows truly reliable end-to-end, then scale into broader "
                "admin tooling, billing automation, and growth features."
            ),
            styles["Body"],
        )
    )

    story.append(Paragraph("10. Success Definition for This Phase", styles["Section"]))
    success = [
        "A new student can complete auth, onboarding, chat, notes, and revision in one uninterrupted flow.",
        "Most syllabus questions return grounded answers with relevant citations.",
        "Roman Nepali and English responses are both reliable and user-controlled per message.",
        "Core product usage is stable enough for repeated daily student sessions.",
    ]
    story.append(_bullet_list(success, styles))

    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "Status Summary: Core foundation is strong; final priority is verified real RAG grounding and the remaining core UX gaps.",
            styles["SmallLabel"],
        )
    )

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Nano Syllabus - Product Status Report",
        author="Nano Syllabus Product & Engineering",
    )
    doc.build(story)


def _bullet_list(items: list[str], styles) -> ListFlowable:
    bullet_style = styles["Body"]
    flow_items = [ListItem(Paragraph(item, bullet_style), leftIndent=6) for item in items]
    return ListFlowable(
        flow_items,
        bulletType="bullet",
        start="circle",
        bulletFontName="Helvetica",
        bulletFontSize=8,
        leftIndent=14,
        spaceBefore=4,
        spaceAfter=4,
    )


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "docs" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "nano_syllabus_full_status_report_2026-05-01.pdf"
    build_report(output_path)
    print(output_path)


if __name__ == "__main__":
    main()
