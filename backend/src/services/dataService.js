   async function updateHistoricalDataTimestamps() {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get the current data time range
      const rangeResult = await client.query(
        `SELECT MIN(time_dt) as min_time, MAX(time_dt) as max_time 
         FROM historical_data`
      );
      
      const minTime = rangeResult.rows[0].min_time;
      const maxTime = rangeResult.rows[0].max_time;
      
      // Calculate the time difference (milliseconds)
      const timeRange = new Date(maxTime) - new Date(minTime);
      
      // 2. Calculate the new time range (now - timeRange to now)
      const now = new Date();
      const newMinTime = new Date(now.getTime() - timeRange);
      
      // 3. Create a temporary table
      await client.query('CREATE TEMP TABLE temp_historical AS SELECT * FROM historical_data');
      
      // 4. Update the timestamp of the temporary table
      await client.query(
        `UPDATE temp_historical 
         SET time_dt = time_dt + $1::interval
         WHERE true`,
        [(now - new Date(maxTime)) + 'milliseconds']
      );
      
      // 5. Empty and repopulate the main table
      await client.query('DELETE FROM historical_data');
      await client.query('INSERT INTO historical_data SELECT * FROM temp_historical');
      
      // 6. Delete the temporary table
      await client.query('DROP TABLE temp_historical');
      
      await client.query('COMMIT');
      
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating historical data timestamps:', error);
      throw error;
    } finally {
      client.release();
    }
  }