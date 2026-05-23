"""PDF 导出服务 - 使用 Playwright 渲染 HTML 生成 PDF"""

import asyncio
import io
from typing import Dict, Any
from playwright.async_api import async_playwright

PDF_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
* { box-sizing: border-box; }
body { font-family: 'Noto Sans SC', -apple-system, sans-serif; font-size: 13px; color: #1f2937; margin: 0; background: #fff; }
.page { max-width: 680px; margin: 0 auto; padding: 48px 48px 64px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
.header-left h1 { font-size: 26px; font-weight: 700; color: #111827; margin: 0 0 6px; letter-spacing: -0.5px; }
.header-right { text-align: right; }
.badge { display: inline-block; background: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; margin-bottom: 6px; }
.duration { font-size: 12px; color: #9ca3af; }
.divider { height: 1px; background: #f3f4f6; margin: 28px 0; }
.step { margin-bottom: 24px; }
.step-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.time-pill { background: #1d4ed8; color: white; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 12px; white-space: nowrap; }
.duration-tag { font-size: 10px; color: #9ca3af; white-space: nowrap; }
.step-title { font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 4px; }
.step-desc { font-size: 12px; color: #6b7280; line-height: 1.6; margin: 0 0 6px; }
.step-loc { font-size: 11px; color: #9ca3af; }
.transport-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; margin: 8px 0; color: #6b7280; font-size: 12px; }
.transport-icon { font-size: 16px; }
.suggestions-box { background: #fef9c3; border: 1px solid #fde047; border-radius: 12px; padding: 16px 20px; margin-top: 32px; }
.suggestions-box h3 { font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 10px; }
.suggestions-box ul { margin: 0; padding-left: 18px; }
.suggestions-box li { font-size: 12px; color: #78350f; margin-bottom: 5px; line-height: 1.5; }
.footer { margin-top: 48px; text-align: right; font-size: 10px; color: #d1d5db; }
"""


def build_plan_html(plan: Dict[str, Any]) -> str:
    """把 plan 数据转成 HTML"""
    steps_html = ""
    for step in plan.get("steps", []):
        if step.get("type") == "transport":
            icon = "🚶" if "步行" in step.get("title", "") else ("🚇" if "公共交通" in step.get("title", "") else "🚗")
            steps_html += f"""
    <div class="transport-row">
        <span class="transport-icon">{icon}</span>
        <span>{step.get('description', step.get('title', ''))}</span>
    </div>
"""
        else:
            time_range = step.get('time_range', '')
            duration = step.get('duration_minutes', 0)
            title = step.get('title', '')
            desc = step.get('description', '')
            loc = step.get('location', '')
            steps_html += f"""
    <div class="step">
        <div class="step-top">
            <span class="time-pill">{time_range.split('-')[0] if '-' in time_range else time_range}</span>
            <span class="duration-tag">{duration}分钟</span>
        </div>
        <div class="step-title">{title}</div>
        <div class="step-desc">{desc}</div>
        {f"<div class='step-loc'>📍 {loc}</div>" if loc else ''}
    </div>
    <div class="divider"></div>
"""
    suggestions_html = ""
    if plan.get("suggestions"):
        suggestions_html = f"""
    <div class="suggestions-box">
        <h3>💡 贴心建议</h3>
        <ul>
            {"".join(f"<li>{s}</li>" for s in plan['suggestions'])}
        </ul>
    </div>
"""
    scenario_type = plan.get("scenario", {}).get("scenario_type", "casual")
    type_label = {"family": "👨‍👩‍👧 家庭", "friends": "👫 朋友", "couple": "💑 约会", "solo": "🙋 独自", "casual": "🎉 休闲"}.get(scenario_type, "🎉 休闲")

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<style>{PDF_CSS}</style>
</head>
<body>
<div class="page">
    <div class="header">
        <div class="header-left">
            <h1>周末活动规划</h1>
            <div class="duration">{plan.get('summary', '')}</div>
        </div>
        <div class="header-right">
            <div class="badge">{type_label}</div>
            <div class="duration">{plan.get('total_duration_hours', 0)}小时</div>
        </div>
    </div>
    <div class="divider"></div>
    {steps_html}
    {suggestions_html}
    <div class="footer">由周末闲时规划生成</div>
</div>
</body>
</html>"""


async def _generate_pdf_async(plan: Dict[str, Any]) -> bytes:
    """异步生成 PDF"""
    html_content = build_plan_html(plan)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(html_content, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="A4",
            margin={"top": "15mm", "bottom": "15mm", "left": "15mm", "right": "15mm"},
            print_background=True,
        )
        await browser.close()
    return pdf_bytes


def generate_pdf(plan: Dict[str, Any]) -> bytes:
    """生成 PDF（同步封装）"""
    return asyncio.run(_generate_pdf_async(plan))