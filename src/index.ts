import Fetch from 'https://cdn.pika.dev/@economia/feed-to-json-promise@^1.8.2';
import EventEmitter from 'https://raw.githubusercontent.com/denoland/deno/master/std/node/events.ts';
import { Cache } from "./types/cache.interface.ts";
import { Article } from "./types/article.interface.ts";

export default class RssFeed extends EventEmitter {
    private tools: {
        // TODO: Delete this shit
        parseXmlToJson(data: string): any
    };
    urls: string[]
    private _interval: number;
    cache: Cache;
    private timerId: ReturnType<typeof setTimeout>;

    constructor(urls?: string[], interval?: number) {
        super()
        this.tools = new Fetch()
        this.urls = urls || []
        this._interval = (interval || 60) * 1000
        this.cache = {}
        this.timerId = 0
    }

    getAllArticles(url: string): Promise<Article[]> {
        return fetch(url)
            .then(data => data.text())
            .then(async rawXml => {
                const xml = await this.tools.parseXmlToJson(rawXml)
                    .catch(this.emitError.bind(this))

                return xml.rss.channel[0].item
                    .map((item: any) => {
                        item.title = item.title[0]
                        return item
                    })
            })
            .catch(this.emitError.bind(this))
    }

    checkUpdate(url: string, cacheOnly?: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            this.getAllArticles(url)
                .then((articles) => {
                    for (const article of articles) {
                        if (!this.cached(url, article.title) && !cacheOnly) {
                            this.emit('update', article)
                        } else break;
                    }

                    const titles = articles.map(a => a.title).slice(0, 2)
                    this.saveToCache(url, titles[0], titles[1])
                    resolve()
                })
                .catch(reject)
        })
    }

    checkAllUpdates(): void {
        const requests = this.urls.map(url => this.checkUpdate(url))
        console.log('.\n')
        Promise.all(requests)
            .catch(this.emitError.bind(this))
    }

    private cacheAll(): void {
        const requests = this.urls.map(url => this.checkUpdate(url, true))
        Promise.allSettled(requests)
            .then(results => {
                for (const result of results) {
                    if (result.status === 'rejected') {
                        this.emitError(result.reason)
                    }
                }
            })
    }
    
    startListening(): void {
        this.cacheAll()
        this.timerId = setInterval(this.checkAllUpdates.bind(this), this._interval)
    }

    stopListening(): void {
        if (this.timerId == 0) {
            clearInterval(this.timerId)
            this.timerId = 0
        }
    }

    private emitError(err: string | ErrorEvent) {
        this.emit('error', err)
    }

    private saveToCache(url: string, lastTitle: string | undefined, preLastTitle: string | undefined) {
        this.cache[url] = {
            last: lastTitle || null,
            second: preLastTitle || null
        }
    }

    private cached(url: string, title: string): boolean {
        if (!this.cache[url]) return false
        return this.cache[url].last === title || this.cache[url].second === title
    }
}
