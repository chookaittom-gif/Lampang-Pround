/** D1 HTTP API client — ใช้ REST query endpoint (ไม่ต้องพึ่ง wrangler) */
export class D1Client {
  constructor({ accountId, apiToken, databaseId }) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.apiToken = apiToken;
  }

  async query(sql, params = []) {
    const resp = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    const data = await resp.json();
    if (!data.success) {
      throw new Error(`D1 query failed: ${JSON.stringify(data.errors ?? data)}`);
    }
    return data.result?.[0]?.results ?? [];
  }

  /** รันคำสั่งเป็นชุด (transaction เดียวต่อ statement — D1 query แต่ละ call atomic) */
  async execute(sql, params = []) {
    await this.query(sql, params);
  }
}
