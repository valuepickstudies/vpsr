import axios from 'axios';
import { format, subDays } from 'date-fns';

async function test() {
  const today = new Date();
  const prevDate = subDays(today, 7);
  const strToDate = format(today, "yyyyMMdd");
  const strPrevDate = format(prevDate, "yyyyMMdd");
  
  const bseUrl = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?pageno=2&strCat=-1&strPrevDate=${strPrevDate}&strScrip=&strSearch=P&strToDate=${strToDate}&strType=C`;
  
  try {
    const res = await axios.get(bseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.bseindia.com/",
        "Origin": "https://www.bseindia.com"
      }
    });
    console.log("Total returned page 2:", res.data.Table?.length);
    console.log("First item page 2:", res.data.Table?.[0]?.NEWSSUB);
  } catch (e: any) {
    console.error(e.message);
  }
}
test();
