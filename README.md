[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](README.KR.md)

<p align="center">
  <img src="public/icon-512.png" alt="Zelkova Classroom Helper" width="120" />
</p>

<h1 align="center">Zelkova Classroom Helper (느티나무 교실 도우미)</h1>

<p align="center">
  A web app for special-education classrooms at a middle school.<br />
  It does the repetitive paperwork, so teachers and staff have more time for students.
</p>

<br />

# The Problem

Special-education teachers and staff spend hours every week on paperwork that follows the same pattern:

* Rebuilding **each student's timetable** by hand from many homeroom timetables
* Retyping **IEPs (Individualized Education Programs)** into the school's 한글 (HWP) form, then fixing broken layouts
* Drawing **classroom materials** (promise boards, praise bankbooks, name tags, worksheets) one at a time
* Keeping **daily activity logs** on paper, and passing on handover notes by word of mouth

**Zelkova Classroom Helper puts all of this in one place.** Fill in the information once, and the app produces finished, printable documents.

<br />

# Features

### 📋 General tools (open to everyone)

| Tool | Problem it solves | What you get |
| --- | --- | --- |
| 🗓️ **Special-class timetable** | Combining each student's subjects with every homeroom timetable by hand | A full special-class timetable plus one timetable per student (Word), each fitted to one page |
| ✅ **My promise board** | Drawing a monthly behaviour-promise chart for each student | A dated monthly board with the student's name (PNG / PDF) |
| 💰 **Praise bankbook** | Making reward booklets by hand | A bankbook-style booklet (cover, info page, record pages), printed 4 pages per A4 sheet |
| 🏷️ **Name tags** | Designing and lining up name tags | Colour-framed cards with a character, class and name, 14 per A4 sheet |
| 🍱 **School meal menu** | Searching the school website for this month's menu | A direct link to this month's meal notice |
| ✍️ **Positive-writing practice** | Preparing handwriting worksheets | Grid-notebook worksheets (trace / copy / blank) at word, sentence or story level (PDF) |
| 👥 **Student info** 🔒 | Re-entering the same student list in every tool | One shared student list that the other tools use |

### 🗂️ Admin tools (login required)

| Tool | Problem it solves | What you get |
| --- | --- | --- |
| 📝 **IEP writer** | Typing IEPs into the school's HWP form and fixing the layout by hand | A web editor that looks exactly like the school form. Several teachers can edit at the same time, and the download is a `.hwp` file identical to the screen |
| 📒 **Assistant activity log** | Paper-based weekly logs and schedules | A weekly checklist log with a calendar, saved on the server and shared across computers |
| 💬 **Handover guide chatbot** | Handover knowledge lost when staff change | A chatbot that answers questions using the saved handover guide. Student names are replaced with labels like "Student A" before anything is sent to the AI |

<br />

# How to Use

1. Open the app and choose a tool card on the main screen
2. Fill in the information (or pick students from the shared student list)
3. Check the preview, then **download / print** the result

> The **Admin** tab and the student-info tool require a login.

<br />

# How It Works

### 🗓️ Timetables: run in your browser
The homeroom timetable Excel file is read **inside the browser**. The app works out where each student is in every period and fills the school's Word template. Files are never uploaded to the server.

### 🎨 Classroom materials: drawn as SVG
Promise boards, bankbooks, name tags and worksheets are drawn by code as SVG. Names and dates are always exact, and the preview is the same picture that gets printed or saved.

### 📝 IEP: one document, two views
```
Blank school form (.hwp) ──▶ Assemble per student / subject ──┬──▶ Web editor (what you see)
                                                              └──▶ Download (.hwp)
```
* The server copies parts of the school's blank HWP form for each student and subject, then fills in the text.
* **The same assembled document** is used both to draw the editor and to write the downloaded file. Text, tables, formatting, row heights and page breaks therefore match.
* Edits are saved field by field. When two teachers change the same field at once, both changes are merged.

### 🔐 Privacy
* Login IDs and passwords are kept only in server environment variables, stored as hashes.
* Student names are never sent to external AI services, and the IEP tool has no AI features.

<br />

# Getting Started

Requires **Node.js 26 or later** (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:3000
```

Production: `npm run build && npm start`

### Login setup
```bash
node scripts/hash-password.mjs <id> <password>
```
Put the printed values (`ADMIN_ID`, `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`) in `.env.local` for local use, or in your host's environment variables (e.g. Vercel) when you deploy.

### Data storage
If `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash Redis) are set, data is saved there. Otherwise it is saved as JSON files in the `data/` folder.

<br />

# Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Upstash Redis · SheetJS · JSZip · HWP 5.0 file handling written for this project
