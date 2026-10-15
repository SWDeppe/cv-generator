# CV Generator

A small JavaScript tool that generates a PDF CV. The CV content is kept separate from the code in a JSON file, so you can update the information without changing the layout.

The generated document is A4-sized and includes contact details, languages, skills, education, a profile, and projects. A project map connects projects to the languages and libraries they use. Contact and project links are clickable in the PDF.

## Requirements

- Node.js and npm

## Installation

Clone the repository, navigate to the project directory, and install the dependencies:

```bash
npm install
```

## Generate the CV

```bash
node index.js
```

The `cv.pdf` file is created in the project root. Run the command again after updating the data.

## Customize the content

Edit [`cv_data.json`](cv_data.json) to update personal information, languages, skills, education, and projects. The [`cv_pic.jpg`](cv_pic.jpg) file contains the photo displayed in the sidebar; keep its filename or update the `picture` field in the JSON.

Projects are grouped by category in `projects` (`personal`, `school`, `business`, and `challenges`). Set `featured` to `true` to show a project in the "Featured projects" section. Technical skills and their proficiency levels, on a scale from 0 to 10, are defined in `IT_langs`; technologies used by projects also appear in the project map.

Links are set in the `url` fields for contact details and the `link` fields for education and projects. Fields whose value is still `TODO` are omitted from the CV. When adding an item, follow the existing JSON structure and make sure the file remains valid JSON.

## Project files

| File | Purpose |
| --- | --- |
| `index.js` | PDF generation and layout |
| `cv_data.json` | CV data and content |
| `cv_pic.jpg` | Photo used in the CV |
| `cv.pdf` | Generated CV |

## Technology

- JavaScript (ES modules)
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
