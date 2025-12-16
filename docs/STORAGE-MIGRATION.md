# Storage Migration (v0.3.0)

## What Changed

In v0.3.0, sidecar results are now stored in `message.extra` instead of HTML comments in the message text.

### Why?

**Before:** Results were stored as HTML comments in the message text:
```html
<!-- sidecar-storage:addon_12345:YGBgaHRtbAo... (2-5KB of base64) -->
```

This was bad because:
- The comments got sent to the AI as part of context (wasting tokens)
- Could confuse the main AI
- Massive token waste (2-5KB per result × multiple sidecars × many messages)
- Visible in message source

**After:** Results are stored in `message.extra`:
```javascript
message.extra.sidecarResults = {
  "addon_12345": {
    result: "...",
    addonName: "Reader Comments",
    timestamp: 1234567890
  }
}
```

This is better because:
- Not sent to AI (saves tokens)
- Clean separation of data vs display
- Easier to manage
- Follows SillyTavern conventions

### Token Savings

With 3 sidecars per message and 20 messages in context:

**Before:** ~45,000 extra tokens per request = $0.45-0.90 extra cost  
**After:** 0 extra tokens = $0 extra cost

You save a lot of tokens and money.

## Migration

**Good news:** Migration is automatic.

When you update to v0.3.0:
- New results go to `message.extra`
- Old HTML comments still work (backward compatible)
- Old comments get cleaned up when results are updated

### How It Works

**Reading results:**
- Checks `message.extra` first
- Falls back to HTML comments if needed
- Both work seamlessly

**Saving new results:**
- Stores in `message.extra` only
- Removes old HTML comments if found

**Updating existing results:**
- Stores in `message.extra`
- Cleans up old HTML comments
- Gradual migration as you use sidecars

### Manual Cleanup (Optional)

If you want to clean up old HTML comments right away, open browser console (F12) and run:

```javascript
const chatLog = SillyTavern.getContext().chat;
let cleaned = 0;

chatLog.forEach(msg => {
  if (msg.mes && msg.mes.includes('sidecar-storage:')) {
    const before = msg.mes.length;
    msg.mes = msg.mes.replace(/\n?<!-- sidecar-storage:[^>]+ -->/g, '');
    msg.mes = msg.mes.replace(/\n?<!-- sidecar-edited:[^>]+ -->/g, '');
    msg.mes = msg.mes.replace(/\n?<!-- sidecar-fallback:[^>]+ -->/g, '');
    if (before !== msg.mes.length) cleaned++;
  }
});

console.log(`Cleaned ${cleaned} messages`);
SillyTavern.getContext().saveChat();
```

### Verify It's Working

Check a recent message:

```javascript
const lastMsg = SillyTavern.getContext().chat.slice(-1)[0];
console.log('Results in message.extra:', lastMsg.extra?.sidecarResults);
console.log('Has old comments:', lastMsg.mes?.includes('sidecar-storage:'));
```

Should show results in `message.extra` and no old comments.

## Impact on Existing Chats

**No data loss:**
- All existing results are preserved
- History viewer still works
- Edit functionality still works
- No re-processing needed

**Gradual migration:**
- Old data migrates as you edit/update results
- No rush, happens automatically

**Export/Import:**
- Both formats are included in exports
- Full backward compatibility
- Mixed formats handled gracefully

## For Developers

If you're accessing sidecar results programmatically:

**Old way (deprecated):**
```javascript
const pattern = /<!-- sidecar-storage:addon_id:(.+?) -->/;
const match = message.mes.match(pattern);
const decoded = atob(match[1]);
```

**New way:**
```javascript
const result = message.extra?.sidecarResults?.['addon_id']?.result;
```

Much cleaner.

**Backward compatible code:**
```javascript
function getSidecarResult(message, addonId) {
  // Try modern storage
  if (message.extra?.sidecarResults?.[addonId]) {
    return message.extra.sidecarResults[addonId].result;
  }
  
  // Fallback to legacy
  const pattern = new RegExp(`<!-- sidecar-storage:${addonId}:(.+?) -->`);
  const match = message.mes?.match(pattern);
  if (match && match[1]) {
    return decodeURIComponent(escape(atob(match[1])));
  }
  
  return null;
}
```

## Troubleshooting

**Results not showing after update?**
- They're still there, just stored differently
- Refresh the page
- Check console for migration messages

**Old HTML comments still visible?**
- Normal for existing results that haven't been updated yet
- They'll be cleaned up when results are edited/regenerated
- Run manual cleanup script if you want immediate cleanup

**Context still seems bloated?**
- Check if other extensions are adding HTML comments
- Verify you're on v0.3.0 (check manifest.json)
- Look for `[Sidecar AI] Saved result in message.extra` in console
