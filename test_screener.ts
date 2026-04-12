import axios from 'axios';
import * as cheerio from 'cheerio';

async function testScreener() {
  const url = 'https://www.screener.in/company/TCS/consolidated/';
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html"
    }
  });

  const $ = cheerio.load(response.data);
  const pageText = $('body').text();
  const bseMatch = pageText.match(/BSE:\s*(\d{6})/);
  console.log("BSE Symbol:", bseMatch ? bseMatch[1] : "Not found");

  const quartersSection = $('#quarters');
  const quarterNames: string[] = [];
  quartersSection.find('thead th').each((i, el) => {
    if (i > 0) quarterNames.push($(el).text().trim());
  });
  console.log("Quarters:", quarterNames);
}
testScreener();
