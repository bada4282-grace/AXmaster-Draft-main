#!/usr/bin/env python3
"""
sync.py — rules/source.md 를 Cline(.clinerules)과 Cursor(.cursor/rules/main.mdc)에 동기화
사용법: python superpowers/sync.py  (프로젝트 루트에서 실행)
        또는 cd superpowers && python sync.py
"""

import os

# 이 스크립트가 있는 superpowers/ 디렉토리를 기준으로 경로 계산
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 프로젝트 루트는 superpowers/의 상위 디렉토리
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

SOURCE_PATH = os.path.join(SCRIPT_DIR, "rules", "source.md")
CLINE_PATH = os.path.join(ROOT_DIR, ".clinerules")
CURSOR_DIR = os.path.join(ROOT_DIR, ".cursor", "rules")
CURSOR_PATH = os.path.join(CURSOR_DIR, "main.mdc")

CURSOR_FRONTMATTER = "---\ndescription: main rules\nalwaysApply: true\n---\n\n"


def sync():
    if not os.path.exists(SOURCE_PATH):
        print(f"[ERROR] {SOURCE_PATH} 파일이 없습니다.")
        return

    source = open(SOURCE_PATH, encoding="utf-8").read()

    # Cline — 프로젝트 루트에 생성
    open(CLINE_PATH, "w", encoding="utf-8").write(source)
    print(f"[OK] Cline  -> {CLINE_PATH}")

    # Cursor — 프로젝트 루트 .cursor/rules/main.mdc 에 생성
    os.makedirs(CURSOR_DIR, exist_ok=True)
    open(CURSOR_PATH, "w", encoding="utf-8").write(CURSOR_FRONTMATTER + source)
    print(f"[OK] Cursor -> {CURSOR_PATH}")


if __name__ == "__main__":
    sync()
