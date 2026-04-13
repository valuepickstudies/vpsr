# Indian Announcement Document Processing Workflow

This document outlines the step-by-step workflow for finding, accessing, and processing financial announcement documents from the Indian market (BSE).

## 1. Source Identification
- **Source**: BSE (Bombay Stock Exchange) India.
- **Access Point**: BSE India API (`https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w`).

## 2. Accessing Data
1.  **Target URL Construction**:
    - Build the URL with parameters:
        - `pageno`: Current page number (1-5).
        - `strCat`: Category (e.g., "-1", "Result", "Financial Result", "Outcome of Board Meeting").
        - `strPrevDate`: Start date (7 days ago).
        - `strToDate`: End date (today).
        - `strSearch`: "P".
        - `strType`: "C".
2.  **Request**: Perform an HTTP GET request to the BSE API.
    - **Constraints**:
        - Use a modern browser `User-Agent`.
        - Set `Referer` and `Origin` headers to `https://www.bseindia.com/`.
        - Implement robust timeout handling (e.g., 10s).

## 3. Parsing & Processing
1.  **Load Content**: Parse the JSON response (`response.data.Table`).
2.  **Iterate**: Loop through each item in the returned array.
3.  **Extract Fields**:
    - **ID**: `NEWSID`
    - **Symbol/Scrip Code**: `SCRIP_CD`
    - **Company Name**: `SLONGNAME`
    - **Subject**: `NEWSSUB`
    - **Date**: `DT_TM`
    - **Attachment**: Construct PDF link using `ATTACHMENTNAME` (`https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`).
    - **Category**: `CATEGORYNAME`
4.  **Normalization**:
    - Map fields to a standardized structure.
    - Set `exchange` to "BSE".

## 4. Data Storage
1.  **Database**: Insert into the local SQLite database (`announcements` table).
2.  **Constraint**: Use `INSERT OR IGNORE` to prevent duplicates based on `NEWSID`.

## 5. Automation
- The sync process is automated to run every 5 minutes (`setInterval` in `server.ts`).
