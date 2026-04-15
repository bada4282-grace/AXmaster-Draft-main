# 챗봇 인증 및 채팅 로그 설계

**날짜:** 2026-04-14
**범위:** 1단계 — 로그인 + 채팅 로그 저장 + welcome message (2단계 챗봇 AI 응답은 별도 진행)

---

## 개요

K-STAT에 이메일/비밀번호 기반 회원가입·로그인 기능을 추가하고, 로그인 사용자의 채팅 로그를 Supabase에 저장한다. 재접속 시 이전 채팅 로그를 Claude API로 분석해 개인화된 welcome message를 표시한다.

---

## 1. 데이터 구조

### Supabase 테이블

**auth.users** — Supabase 자동 생성 (별도 작업 불필요)

**chat_logs** — 신규 생성
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | primary key, auto |
| user_id | uuid | auth.users.id 참조 |
| role | text | 'user' \| 'bot' |
| content | text | 메시지 내용 |
| created_at | timestamptz | 생성 시각, default now() |

**RLS 정책:** 로그인 사용자는 본인의 chat_logs만 읽고 저장할 수 있다. 다른 사용자의 로그에는 접근 불가. (Supabase가 자동으로 차단)

---

## 2. 페이지 및 파일 구조

### 신규 파일
```
app/
├── login/page.tsx          — 로그인 페이지 (이메일 + 비밀번호)
├── signup/page.tsx         — 회원가입 페이지
└── api/welcome/route.ts    — Claude API 호출 (welcome message 생성)

lib/
├── auth.ts                 — signUp, signIn, signOut, getSession 함수
└── chat.ts                 — saveChatLog, getChatLogs 함수
```

### 수정 파일
```
components/Header.tsx       — "로그인" 텍스트를 /login 링크로 변경
components/ChatBot.tsx      — 로그인 여부 확인, 로그 저장, welcome message 표시
```

---

## 3. 인증 흐름

```
Header "로그인" 클릭
  → /login 페이지
  → 이메일/비밀번호 입력 → Supabase signInWithPassword()
  → 성공: 홈(/)으로 리다이렉트
  → 실패: 에러 메시지 표시

Header "회원가입" 클릭 (로그인 페이지 내 링크)
  → /signup 페이지
  → 이메일/비밀번호 입력 → Supabase signUp()
  → 성공: /login으로 리다이렉트
```

로그인 상태에서 Header "로그인" 텍스트는 "로그아웃"으로 변경된다.

---

## 4. Welcome Message 흐름

```
ChatBot 열기 (로그인 상태)
  → chat_logs에서 최근 50개 메시지 조회
  ├── 로그 없음 → 기본 인사말 표시
  └── 로그 있음 → POST /api/welcome
        → Claude API 호출
           프롬프트: 채팅 로그 기반으로 업종·타겟 국가·관심 품목 유추,
                     최신 무역 데이터 관련 한국어 welcome message 생성
        → 생성된 메시지를 ChatBot 첫 메시지로 표시
```

### 예시 welcome message
> "안녕하세요! 지난번에 베트남 반도체 수출 데이터를 많이 보셨네요. 이번 달 베트남向 반도체 수출이 전월 대비 12% 증가했습니다. 확인해보시겠어요?"

---

## 5. 비로그인 사용자 처리

- 챗봇은 사용 가능하나 로그 저장 안 함
- welcome message 없이 기본 인사말만 표시
- Header에 "로그인" 링크 유지

---

## 6. 다음 단계 (2단계, 별도 진행)

- 챗봇 AI 응답 구현 (무역통계 질문 답변)
- 소셜 로그인 추가 (Google, Kakao)
