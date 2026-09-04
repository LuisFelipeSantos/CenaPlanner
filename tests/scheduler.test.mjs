import test from 'node:test';
import assert from 'node:assert/strict';
import scheduler from '../workers/notification-scheduler.ts';
test('daily trigger scans; retry trigger only dispatches, and authorization is supplied',async(t)=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    calls.push({url:new URL(url),options});
    return Response.json({nextCursor:null,hasMore:false,examined:0});
  });
  const env={SITE_ORIGIN:'https://example.invalid',NOTIFICATION_CRON_SECRET:'test-only'};
  await scheduler.scheduled({cron:'0 12 * * *'},env);
  await scheduler.scheduled({cron:'*/5 * * * *'},env);
  assert.equal(calls[0].url.searchParams.get('mode'),null);
  assert.equal(calls[1].url.searchParams.get('mode'),'dispatch');
  assert.equal(calls[0].options.headers.Authorization,'Bearer test-only');
});
test('daily worker advances scan cursor and rejects failed processing',async(t)=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    urls.push(new URL(url));
    return Response.json({nextCursor:urls.length===1?'entry-last':null,hasMore:false});
  });
  await scheduler.scheduled({cron:'0 12 * * *'},{SITE_ORIGIN:'https://example.invalid',NOTIFICATION_CRON_SECRET:'test-only'});
  assert.equal(urls.length,2);
  assert.equal(urls[1].searchParams.get('cursor'),'entry-last');
  globalThis.fetch=async()=>new Response('',{status:503});
  await assert.rejects(()=>scheduler.scheduled({cron:'0 12 * * *'},{SITE_ORIGIN:'https://example.invalid',NOTIFICATION_CRON_SECRET:'test-only'}));
});
