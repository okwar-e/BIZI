'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseDatasetRows } = require('../scripts/seedDatasetCreatorSamples');

test('CSV reader handles quoted commas, quotes, and embedded newlines', () => {
  assert.deepEqual(parseCsv('name,bio\r\n"Creator, One","Said ""hello""\nthere"\r\n'), [
    { name: 'Creator, One', bio: 'Said "hello"\nthere' },
  ]);
});

test('dataset seeder maps model counts and creates clearly synthetic audience text', () => {
  const rows = parseDatasetRows([
    'creator_username,creator_display_name,creator_category,creator_bio,creator_followers,creator_following,creator_post_count',
    'source_1,"Creator One","Food","Contact me at person@example.test",125,45,10',
  ].join('\n'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'source_1');
  assert.equal(rows[0].followers, 125);
  assert.equal(rows[0].following, 45);
  assert.equal(rows[0].postCount, 10);
  assert.equal(rows[0].bio, 'Contact me at [contact removed]');
  assert.match(rows[0].audienceDescription, /^Synthetic test audience profile for Food/);
  assert.deepEqual(rows[0].syntheticFields, []);
  assert.match(rows[0].email, /@sample\.invalid$/);
  assert.match(rows[0].handle, /^SAMPLE_/);
});

test('dataset seeder deterministically synthesizes missing model counts per source creator', () => {
  const rows = [
    'creator_username,creator_display_name,creator_category,creator_bio,creator_followers,creator_following,creator_post_count',
    'source_1,Creator One,Food,Bio,,,',
    'source_2,Creator Two,Travel,Bio,,,',
  ].join('\n');
  const [first, second] = parseDatasetRows(rows);
  const [firstAgain] = parseDatasetRows(rows);

  assert.deepEqual(first.syntheticFields, [
    'creator_followers', 'creator_following', 'creator_post_count',
  ]);
  assert.ok(first.followers >= 500 && first.followers <= 50000);
  assert.ok(first.following >= 100 && first.following <= 10000);
  assert.ok(first.postCount >= 5 && first.postCount <= 1000);
  assert.deepEqual(first, firstAgain);
  assert.notDeepEqual(
    [first.followers, first.following, first.postCount],
    [second.followers, second.following, second.postCount]
  );
});

test('dataset seeder synthesizes missing profile text and rejects missing or duplicate source identifiers', () => {
  const header = 'creator_username,creator_display_name,creator_category,creator_bio,creator_followers,creator_following,creator_post_count';
  const [synthetic] = parseDatasetRows(`${header}\nsource_1,,,,,,`);
  assert.equal(synthetic.category, 'General creator');
  assert.match(synthetic.displayName, /^Dataset test creator /);
  assert.match(synthetic.bio, /^Synthetic test profile for General creator/);
  assert.deepEqual(synthetic.syntheticFields, [
    'creator_followers', 'creator_following', 'creator_post_count',
    'creator_display_name', 'creator_category', 'creator_bio',
  ]);
  assert.throws(() => parseDatasetRows(`${header}\n,Creator One,Food,Bio,125,45,10`), /missing creator_username/);
  assert.throws(
    () => parseDatasetRows(`${header}\nsource_1,Creator One,Food,Bio,125,45,10\nsource_1,Creator Two,Food,Bio,250,90,20`),
    /duplicate source identifier/
  );
});
