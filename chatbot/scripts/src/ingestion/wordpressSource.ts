import axios from 'axios';

export interface WPPage {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
  type: string;
}

export class WordPressSource {
  constructor(private baseUrl: string = 'https://student.sum.edu.pl/wp-json/wp/v2') {}

  async fetchAll(endpoint: string, extraParams: Record<string, unknown> = {}): Promise<WPPage[]> {
    const items: WPPage[] = [];
    let page = 1;

    while (true) {
      const res = await axios.get<WPPage[]>(`${this.baseUrl}/${endpoint}`, {
        params: { per_page: 100, page, ...extraParams },
        timeout: 30000,
      });

      if (!res.data?.length) break;
      items.push(...res.data);

      const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
      if (page >= total) break;
      page++;
    }

    return items;
  }

  async fetchPages(): Promise<WPPage[]> {
    return this.fetchAll('pages', { status: 'publish', _fields: 'id,slug,link,title,content,date,type' });
  }

  async fetchPosts(): Promise<WPPage[]> {
    return this.fetchAll('posts', { status: 'publish', _fields: 'id,slug,link,title,content,date,type' });
  }

  async fetchPlacowki(): Promise<WPPage[]> {
    return this.fetchAll('placowki', { status: 'publish', _fields: 'id,slug,link,title,content,date,type' });
  }
}
