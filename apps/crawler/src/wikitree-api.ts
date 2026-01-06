/**
 * WikiTree API Client
 * API Documentation: https://www.wikitree.com/wiki/Help:API_Documentation
 */

const API_ENDPOINT = "https://api.wikitree.com/api.php";
const APP_ID = "FunkFamilyTreeCrawler";
const REQUEST_DELAY = 1000; // 1 second between requests

export interface WikiTreeProfile {
  Id?: number;
  Name?: string;
  FirstName?: string;
  MiddleName?: string;
  LastNameAtBirth?: string;
  LastNameCurrent?: string;
  Suffix?: string;
  Gender?: string;
  BirthDate?: string;
  DeathDate?: string;
  BirthLocation?: string;
  DeathLocation?: string;
  IsLiving?: number;
  Father?: number | string;
  Mother?: number | string;
  Spouses?: Record<string, unknown> | unknown[];
  Children?: Record<string, unknown> | unknown[];
  Parents?: Record<string, unknown> | unknown[];
}

export interface WikiTreeApiResponse {
  profile?: WikiTreeProfile;
  ancestors?: WikiTreeProfile[];
  descendants?: WikiTreeProfile[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WikiTreeApi {
  private lastRequestTime = 0;

  private async makeRequest<T>(
    action: string,
    params: Record<string, string | number>
  ): Promise<T | null> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < REQUEST_DELAY) {
      await sleep(REQUEST_DELAY - timeSinceLastRequest);
    }

    const queryParams = new URLSearchParams({
      action,
      appId: APP_ID,
      format: "json",
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    });

    const url = `${API_ENDPOINT}?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "FunkFamilyTreeCrawler/2.0 (genealogy research project)",
          Accept: "application/json",
        },
      });

      this.lastRequestTime = Date.now();

      if (!response.ok) {
        console.error(`API Error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error(`Request failed: ${error}`);
      await sleep(REQUEST_DELAY * 2); // Extra delay on error
      return null;
    }
  }

  async getProfile(wikiId: string): Promise<WikiTreeProfile | null> {
    const fields = [
      "Id",
      "Name",
      "FirstName",
      "MiddleName",
      "LastNameAtBirth",
      "LastNameCurrent",
      "Suffix",
      "BirthDate",
      "DeathDate",
      "BirthLocation",
      "DeathLocation",
      "Gender",
      "Father",
      "Mother",
      "Spouses",
      "Children",
      "Parents",
      "BirthDateDecade",
      "DeathDateDecade",
      "IsLiving",
    ].join(",");

    const result = await this.makeRequest<WikiTreeApiResponse[]>("getProfile", {
      key: wikiId,
      fields,
    });

    if (result && result[0]?.profile) {
      return result[0].profile;
    }

    return null;
  }

  async getAncestors(
    wikiId: string,
    depth = 3
  ): Promise<WikiTreeProfile[]> {
    const fields = [
      "Id",
      "Name",
      "FirstName",
      "LastNameAtBirth",
      "BirthDate",
      "DeathDate",
      "BirthLocation",
      "Gender",
      "Father",
      "Mother",
    ].join(",");

    const result = await this.makeRequest<WikiTreeApiResponse[]>(
      "getAncestors",
      {
        key: wikiId,
        depth,
        fields,
      }
    );

    if (result && result[0]?.ancestors) {
      return result[0].ancestors;
    }

    return [];
  }

  async getDescendants(
    wikiId: string,
    depth = 2
  ): Promise<WikiTreeProfile[]> {
    const fields = [
      "Id",
      "Name",
      "FirstName",
      "LastNameAtBirth",
      "BirthDate",
      "DeathDate",
      "BirthLocation",
      "Gender",
      "Father",
      "Mother",
      "Children",
    ].join(",");

    const result = await this.makeRequest<WikiTreeApiResponse[]>(
      "getDescendants",
      {
        key: wikiId,
        depth,
        fields,
      }
    );

    if (result && result[0]?.descendants) {
      return result[0].descendants;
    }

    return [];
  }
}

export const wikitreeApi = new WikiTreeApi();
