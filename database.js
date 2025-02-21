const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'tweets.db');
    this.db = null;
    this.ensureDataDirectory();
    this.init();
  }

  ensureDataDirectory() {
    const fs = require('fs');
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  init() {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        logger.error('Error opening database', { error: err.message });
        return;
      }
      logger.info('Connected to SQLite database', { path: this.dbPath });
    });

    this.createTables();
  }

  createTables() {
    const createTweetsTable = `
      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        author_id TEXT,
        username TEXT,
        text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sentiment_score REAL,
        sentiment_label TEXT,
        replied BOOLEAN DEFAULT 0,
        reply_text TEXT
      )
    `;

    const createAnalyticsTable = `
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE,
        total_tweets INTEGER DEFAULT 0,
        positive_count INTEGER DEFAULT 0,
        negative_count INTEGER DEFAULT 0,
        neutral_count INTEGER DEFAULT 0,
        avg_sentiment REAL DEFAULT 0,
        replies_sent INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createTweetsTable, (err) => {
        if (err) {
          logger.error('Error creating tweets table', { error: err.message });
        } else {
          logger.info('Tweets table ready');
        }
      });

      this.db.run(createAnalyticsTable, (err) => {
        if (err) {
          logger.error('Error creating analytics table', { error: err.message });
        } else {
          logger.info('Analytics table ready');
        }
      });
    });
  }

  async saveTweet(tweetData) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO tweets 
        (id, author_id, username, text, sentiment_score, sentiment_label, replied, reply_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(query, [
        tweetData.id,
        tweetData.authorId,
        tweetData.username,
        tweetData.text,
        tweetData.sentimentScore,
        tweetData.sentimentLabel,
        tweetData.replied ? 1 : 0,
        tweetData.replyText || null
      ], function(err) {
        if (err) {
          logger.error('Error saving tweet', { error: err.message, tweetId: tweetData.id });
          reject(err);
        } else {
          logger.debug('Tweet saved to database', { tweetId: tweetData.id });
          resolve(this.lastID);
        }
      });
    });
  }

  async updateDailyAnalytics() {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      
      const query = `
        INSERT OR REPLACE INTO analytics 
        (date, total_tweets, positive_count, negative_count, neutral_count, avg_sentiment, replies_sent)
        SELECT 
          ? as date,
          COUNT(*) as total_tweets,
          SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
          SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
          AVG(sentiment_score) as avg_sentiment,
          SUM(CASE WHEN replied = 1 THEN 1 ELSE 0 END) as replies_sent
        FROM tweets 
        WHERE DATE(created_at) = ?
      `;

      this.db.run(query, [today, today], function(err) {
        if (err) {
          logger.error('Error updating daily analytics', { error: err.message });
          reject(err);
        } else {
          logger.info('Daily analytics updated', { date: today });
          resolve();
        }
      });
    });
  }

  async getRecentAnalytics(days = 7) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM analytics 
        ORDER BY date DESC 
        LIMIT ?
      `;

      this.db.all(query, [days], (err, rows) => {
        if (err) {
          logger.error('Error fetching analytics', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          logger.error('Error closing database', { error: err.message });
        } else {
          logger.info('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();