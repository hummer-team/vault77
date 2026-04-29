-- 1.列值替换
CREATE OR REPLACE MACRO udf_replace_spec_column_value(
       tbl,
       fill_map  := '',  -- unconditional whole-column overwrite: {"col": "new_value"}
       null_map  := '',
       swap_map  := '',
       condition := '',
       limit_n := 0
   ) AS TABLE
   SELECT * FROM query(
       'SELECT * ' ||
       CASE WHEN (fill_map <> '' OR null_map <> '' OR swap_map <> '') THEN
           'REPLACE (' ||
           array_to_string(
               list_concat(
                   -- Part 0: fill_map → constant literal AS col（整列替换）
                   list_transform(
                       CASE WHEN fill_map <> ''
                           THEN json_keys(fill_map::JSON)
                           ELSE []::VARCHAR[]
                       END,
                       k ->
                           CASE
                               WHEN json_extract_string(fill_map::JSON, '$."' || k || '"') IS NOT NULL
                                   THEN '''' || replace(json_extract_string(fill_map::JSON, '$."' || k || '"'), '''', '''''') || ''''
                               ELSE json_extract(fill_map::JSON, '$."' || k || '"')::VARCHAR
                           END
                           || ' AS ' || '"' || replace(k, '"', '""') || '"'
                   ),
                   -- Part 1: null_map → COALESCE(col, default) AS col（原地替换）
                   list_transform(
                       CASE WHEN null_map <> ''
                           THEN json_keys(null_map::JSON)
                           ELSE []::VARCHAR[]
                       END,
                       k ->
                           'COALESCE(' || '"' || replace(k, '"', '""') || '"' || ', ' ||
                           CASE
                               WHEN json_extract(null_map::JSON, '$."' || k || '"')::VARCHAR = 'null'
                                   THEN 'NULL'
                               WHEN json_extract_string(null_map::JSON, '$."' || k || '"') IS NOT NULL
                                   THEN '''' || replace(json_extract_string(null_map::JSON, '$."' || k || '"'), '''', '''''') || ''''
                               ELSE json_extract(null_map::JSON, '$."' || k || '"')::VARCHAR
                           END
                           || ') AS ' || '"' || replace(k, '"', '""') || '"'
                   ),
                   -- Part 2: swap_map → CASE WHEN col = from THEN to ELSE col END AS col（原地替换）
                   list_transform(
                       CASE WHEN swap_map <> ''
                           THEN json_keys(swap_map::JSON)
                           ELSE []::VARCHAR[]
                       END,
                       k ->
                           'CASE WHEN ' || '"' || replace(k, '"', '""') || '"' ||
                           ' = ' ||
                           CASE
                               WHEN json_extract_string(swap_map::JSON, '$."' || k || '"[0]') IS NOT NULL
                                   THEN '''' || replace(json_extract_string(swap_map::JSON, '$."' || k || '"[0]'), '''', '''''') || ''''
                               ELSE json_extract(swap_map::JSON, '$."' || k || '"[0]')::VARCHAR
                           END
                           || ' THEN ' ||
                           CASE
                               WHEN json_extract_string(swap_map::JSON, '$."' || k || '"[1]') IS NOT NULL
                                   THEN '''' || replace(json_extract_string(swap_map::JSON, '$."' || k || '"[1]'), '''', '''''') || ''''
                               ELSE json_extract(swap_map::JSON, '$."' || k || '"[1]')::VARCHAR
                           END
                           || ' ELSE ' || '"' || replace(k, '"', '""') || '"'
                           || ' END AS ' || '"' || replace(k, '"', '""') || '"'
                   )
               ),
               ', '
           ) || ')'
       ELSE '' END ||
       -- Support both a plain table name and a sub-query string.
       -- A sub-query is detected by a leading '(' character (used as-is with alias __src).
       -- A plain table name is double-quoted to handle special characters.
       ' FROM ' ||
       CASE WHEN left(trim(tbl), 1) = '('
           THEN tbl || ' AS __src'
           ELSE '"' || replace(tbl, '"', '""') || '"'
       END ||
       CASE WHEN condition <> '' THEN ' WHERE ' || condition ELSE '' END
       ||
       CASE WHEN limit_n::INT > 0 THEN ' LIMIT ' || limit_n ELSE '' END
   );

-- 2.大小写转换
CREATE OR REPLACE MACRO udf_up_lower_str(
       tbl,
       cols,               -- VARCHAR[]，如 ['name','dept']
       action    := 'upper',  -- 'upper' | 'lower'
       condition := ''
   ) AS TABLE
   SELECT * FROM query(
       'SELECT * ' ||
       CASE WHEN len(cols) > 0 THEN
           'REPLACE (' ||
           array_to_string(
               list_transform(
                   cols,
                   k ->
                       CASE WHEN action = 'lower' THEN 'LOWER(' ELSE 'UPPER(' END ||
                       '"' || replace(k, '"', '""') || '"' ||
                       ') AS "' || replace(k, '"', '""') || '"'
               ),
               ', '
           ) ||
           ')'
       ELSE '' END ||
       -- Support both a plain table name and a sub-query string.
       -- A sub-query is detected by a leading '(' character (used as-is with alias __src).
       -- A plain table name is double-quoted to handle special characters.
       ' FROM ' ||
       CASE WHEN left(trim(tbl), 1) = '('
           THEN tbl || ' AS __src'
           ELSE '"' || replace(tbl, '"', '""') || '"'
       END ||
       CASE WHEN condition <> '' THEN ' WHERE ' || condition ELSE '' END
   );
-- 3.精度控制，四舍五入
 CREATE OR REPLACE MACRO udf_format_number(
       tbl,
       cols_config,
       round_mode := 'half_up',
       condition  := ''
   ) AS TABLE
   SELECT * FROM query(
       'SELECT * ' ||
       CASE WHEN len(json_keys(cols_config::JSON)) > 0 THEN
           'REPLACE (' ||
           array_to_string(
               list_transform(
                   json_keys(cols_config::JSON),
                   k ->
                       CASE round_mode
                           WHEN 'truncate' THEN
                               'TRUNC("' || replace(k, '"', '""') || '", ' ||
                               json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR || ')'
                           WHEN 'ceil' THEN
                               'CEIL("' || replace(k, '"', '""') ||
                               '" * POWER(10, ' || json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR ||
                               ')) / POWER(10, ' || json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR || ')'
                           WHEN 'floor' THEN
                               'FLOOR("' || replace(k, '"', '""') ||
                               '" * POWER(10, ' || json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR ||
                               ')) / POWER(10, ' || json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR || ')'
                           ELSE  -- half_up（默认）
                               'ROUND("' || replace(k, '"', '""') || '", ' ||
                               json_extract(cols_config::JSON, '$."' || k || '"')::VARCHAR || ')'
                       END ||
                       ' AS "' || replace(k, '"', '""') || '"'
               ),
               ', '
           ) || ')'
       ELSE '' END ||
       -- Support both a plain table name and a sub-query string.
       -- A sub-query is detected by a leading '(' character (used as-is with alias __src).
       -- A plain table name is double-quoted to handle special characters.
       ' FROM ' ||
       CASE WHEN left(trim(tbl), 1) = '('
           THEN tbl || ' AS __src'
           ELSE '"' || replace(tbl, '"', '""') || '"'
       END ||
       CASE WHEN condition <> '' THEN ' WHERE ' || condition ELSE '' END
   );

--- 4.数据标记
CREATE OR REPLACE MACRO udf_flag_spec_column(
       tbl,
       flags_config,
       condition := ''
    ) AS TABLE
    SELECT * FROM query(
        'SELECT * ' ||
        CASE WHEN len(json_keys(flags_config::JSON)) > 0 THEN
            'REPLACE (' ||
            array_to_string(
                list_transform(
                    json_keys(flags_config::JSON),
                    col_k ->
                        'CASE ' ||
                        array_to_string(
                            list_transform(
                                range(
                                   json_array_length(
                                       json_extract(flags_config::JSON, '$."' || col_k || '".cases')
                                   )::BIGINT
                                ),
                                idx ->
                                    CASE
                                        WHEN substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 1, 2) IN ('>=', '<=', '<>', 'IN')
                                        THEN 'WHEN "' || replace(col_k, '"', '""') || '" ' || substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 1, 2) || ' ''' ||
                                             replace(substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 4), '''', '''''') ||
                                             ''' THEN ''' || replace(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][1]'), '''', '''''') || ''''
                                        WHEN substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 1, 2) IN ('!=')
                                        THEN 'WHEN "' || replace(col_k, '"', '""') || '" != ''' ||
                                             replace(substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 3), '''', '''''') ||
                                             ''' THEN ''' || replace(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][1]'), '''', '''''') || ''''
                                        WHEN substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 1, 1) IN ('=', '>', '<')
                                        THEN 'WHEN "' || replace(col_k, '"', '""') || '" ' || substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 1, 1) || ' ''' ||
                                             replace(substr(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), 2), '''', '''''') ||
                                             ''' THEN ''' || replace(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][1]'), '''', '''''') || ''''
                                        ELSE 'WHEN "' || replace(col_k, '"', '""') || '" = ''' || replace(trim(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][0]')), '''', '''''') ||
                                             ''' THEN ''' || replace(json_extract_string(flags_config::JSON, '$."' || col_k || '".cases[' || idx::VARCHAR || '][1]'), '''', '''''') || ''''
                                    END
                            ),
                            ' '
                        ) ||
                        CASE
                            WHEN json_extract_string(flags_config::JSON, '$."' || col_k || '"."else"') IS NOT NULL
                            THEN ' ELSE ''' || replace(
                                    json_extract_string(flags_config::JSON, '$."' || col_k || '"."else"'),
                                    '''', ''''''
                                 ) || ''''
                            ELSE ' ELSE ' || col_k
                        END ||
                        ' END AS "' || replace(col_k, '"', '""') || '"'
                ),
                ', '
            ) || ')'
        ELSE '' END ||
        -- Support both a plain table name and a sub-query string.
        -- A sub-query is detected by a leading '(' character (used as-is with alias __src).
        -- A plain table name is double-quoted to handle special characters.
        ' FROM ' ||
        CASE WHEN left(trim(tbl), 1) = '('
            THEN tbl || ' AS __src'
            ELSE '"' || replace(tbl, '"', '""') || '"'
        END ||
        CASE WHEN condition <> '' THEN ' WHERE ' || condition ELSE '' END
    );


CREATE OR REPLACE MACRO ts_parse(val, src_fmt) AS (
       CASE
           WHEN val IS NULL           THEN NULL
           WHEN src_fmt = 'auto'      THEN TRY_CAST(val AS TIMESTAMP)
           WHEN src_fmt = 'epoch_s'   THEN to_timestamp(TRY_CAST(val AS DOUBLE))
           WHEN src_fmt = 'epoch_ms'  THEN to_timestamp(TRY_CAST(val AS DOUBLE) / 1000.0)
           WHEN src_fmt = 'epoch_us'  THEN to_timestamp(TRY_CAST(val AS DOUBLE) / 1000000.0)
           WHEN src_fmt = 'date_only' THEN CAST(TRY_CAST(CAST(val AS VARCHAR) AS DATE) AS TIMESTAMP)
           ELSE                            strptime(CAST(val AS VARCHAR), src_fmt)
       END
   );

 CREATE OR REPLACE MACRO ts_convert_tz(ts, src_tz, dst_tz) AS (
       CASE
           WHEN ts IS NULL         THEN NULL
           WHEN src_tz = dst_tz   THEN CAST(ts AS TIMESTAMP)
           ELSE (CAST(ts AS TIMESTAMP) AT TIME ZONE src_tz) AT TIME ZONE dst_tz
       END
   );

CREATE OR REPLACE MACRO ts_format(ts, dst_fmt) AS (
       CASE
           WHEN ts IS NULL              THEN NULL
           WHEN dst_fmt = 'iso8601'     THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S')
           WHEN dst_fmt = 'iso8601_ms'  THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S.') ||
                                             lpad(CAST(millisecond(CAST(ts AS TIMESTAMP)) AS VARCHAR), 3, '0')
           WHEN dst_fmt = 'iso8601_us'  THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S.%f')
           WHEN dst_fmt = 'date'        THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m-%d')
           WHEN dst_fmt = 'time'        THEN strftime(CAST(ts AS TIMESTAMP), '%H:%M:%S')
           WHEN dst_fmt = 'datetime'    THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m-%d %H:%M:%S')
           WHEN dst_fmt = 'epoch_s'     THEN CAST(CAST(epoch(CAST(ts AS TIMESTAMP)) AS BIGINT) AS VARCHAR)
           WHEN dst_fmt = 'epoch_ms'    THEN CAST(epoch_ms(CAST(ts AS TIMESTAMP)) AS VARCHAR)
           WHEN dst_fmt = 'year_month'  THEN strftime(CAST(ts AS TIMESTAMP), '%Y-%m')
           WHEN dst_fmt = 'quarter'     THEN strftime(CAST(ts AS TIMESTAMP), '%Y') || '-Q' ||
                                             CAST(quarter(CAST(ts AS TIMESTAMP)) AS VARCHAR)
           WHEN dst_fmt = 'week_of_year' THEN strftime(CAST(ts AS TIMESTAMP), '%G-W%V')
           ELSE                              strftime(CAST(ts AS TIMESTAMP), dst_fmt)
       END
   );

  CREATE OR REPLACE MACRO transform_time(val, src_fmt, src_tz, dst_tz, dst_fmt) AS (
       ts_format(
           ts_convert_tz(
               ts_parse(val, src_fmt),
               src_tz,
               dst_tz
           ),
           dst_fmt
       )
   );
--- 5. 时间格式化
CREATE OR REPLACE MACRO udf_format_date_time(
       tbl,
       col_config_json,    -- JSON object: key=col_name, value={src_fmt,src_tz,dst_tz,dst_fmt}
       condition := ''     -- optional WHERE clause, default no filter
   ) AS TABLE
   SELECT * FROM query(
       'SELECT * REPLACE (' ||
       array_to_string(
           list_transform(
               json_keys(col_config_json),
               k ->
                   'transform_time('
                       || '"' || replace(k, '"', '""') || '"'
                       || ', ''' || COALESCE(json_extract_string(col_config_json, '$.' || k || '.src_fmt'), 'auto')     || ''''
                       || ', ''' || COALESCE(json_extract_string(col_config_json, '$.' || k || '.src_tz'),  'UTC')      || ''''
                       || ', ''' || COALESCE(json_extract_string(col_config_json, '$.' || k || '.dst_tz'),  'UTC')      || ''''
                       || ', ''' || COALESCE(json_extract_string(col_config_json, '$.' || k || '.dst_fmt'), 'datetime') || ''''
                       || ') AS "' || replace(k, '"', '""') || '"'
           ),
           ', '
       ) ||
       ') FROM ' ||
       CASE WHEN left(trim(tbl), 1) = '('
           THEN tbl || ' AS __src'
           ELSE '"' || replace(tbl, '"', '""') || '"'
       END ||
       CASE WHEN condition <> '' THEN ' WHERE ' || condition ELSE '' END
   );
  -- to_utc: any local timestamp → UTC 'datetime' string
   CREATE OR REPLACE MACRO to_utc(val, src_fmt, src_tz) AS (
       transform_time(val, src_fmt, src_tz, 'UTC', 'datetime')
   );

   -- from_utc: UTC timestamp → target timezone with chosen format
   CREATE OR REPLACE MACRO from_utc(val, src_fmt, dst_tz, dst_fmt) AS (
       transform_time(val, src_fmt, 'UTC', dst_tz, dst_fmt)
   );

   -- ts_trunc_tz: timezone-aware truncation.
   --   Converts to bucket_tz first, then truncates, result is local time in bucket_tz.
   --   unit: 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'
   --   Use case: group orders by NY calendar day even though stored as UTC.
   CREATE OR REPLACE MACRO ts_trunc_tz(val, src_fmt, src_tz, bucket_tz, unit) AS (
       date_trunc(unit, ts_convert_tz(ts_parse(val, src_fmt), src_tz, bucket_tz))
   );

   -- ts_diff_seconds: real elapsed seconds between two timestamps (DST-aware).
   --   Converts both to UTC before subtracting, so DST gaps/overlaps are correct.
   CREATE OR REPLACE MACRO ts_diff_seconds(val_start, val_end, src_fmt, src_tz) AS (
       epoch(ts_convert_tz(ts_parse(val_end,   src_fmt), src_tz, 'UTC')) -
       epoch(ts_convert_tz(ts_parse(val_start, src_fmt), src_tz, 'UTC'))
   );

   -- ts_age_days: days elapsed from a timestamp to now (in src_tz)
   CREATE OR REPLACE MACRO ts_age_days(val, src_fmt, src_tz) AS (
       CAST(
           ts_diff_seconds(val, CAST(now() AT TIME ZONE src_tz AS VARCHAR), src_fmt, src_tz)
           / 86400.0
       AS INTEGER)
   );