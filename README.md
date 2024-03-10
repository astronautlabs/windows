# @/windows

[![npm](https://img.shields.io/npm/v/@astronautlabs/windows)](https://npmjs.com/package/@astronautlabs/windows)

Windows related utilities for Node.js
- Manage Windows services written using Node.js
- Use UAC to elevate permissions
- Send events to Windows' built-in Event Viewer logging system
- Manage Windows processes

# Windows Services

```typescript
import { Service } from '@astronautlabs/windows';

const service = new Service({
  id: 'myservice',
  name: 'My Service',
  description: 'A description for my service',
  script: 'C:\\path\\to\\script.js'
});

await service.install();
await service.start();
```

## How it works

The [winsw](https://github.com/kohsuke/winsw) utility is used to create a unique `.exe` for each Node.js script 
deployed as a service. A directory called `winservice` is created and populated with `myappname.exe` and `myappname.xml`. 
The XML file is a configuration for the executable. `winsw` will also create logs for itself in this directory.
The `winsw` executable will run a wrapper script provided by this library, which calls the script you've defined. The 
wrapper provides monitoring and automatic restarting of your script since Windows own functionality is somewhat limited.

# Event Logging

This library provides the ability to write into the Windows event log (as seen in Event Viewer).

```typescript
import { EventLogger } from '@astronautlabs/windows');

const log = new EventLogger('Hello World');

log.info('Basic information.');
log.warn('Watch out!');
log.error('Something went wrong.');
log.auditSuccess('AUser Login Success');
log.auditFailure('AUser Login Failure');
```

Each log type (info, warn, error, auditSuccess, and auditFailure) can also accept an event code. By default, the event 
code is `1000`. To provide a custom event code with a log message and write that message to the console, the following code could
be used:

```js
log.info('Something different happened!', 700, function(){
  console.log('Something different happened!');
});
```

The value of `code` can be between 0 and 1000.

By default, event logs are sent to the `APPLICATION` log. You can also send to the `SYSTEM` log.

```typescript
import { EventLogger } from '@astronautlabs/windows';
const log = new EventLogger({
  source: 'My Event Log',
  eventLog: 'SYSTEM'
});
```

# Additional Utilities

Includes a number of Windows-specific utilities as well.

## `elevate(cmd, ...)`

Run a command as the administrator user (will show a UAC prompt if process is not already
running as an administrator and the current user has permission to perform UAC).

## `isAdminUser()`

Determine whether the current user has administrative privileges.

```typescript
import { isAdminUser } from '@astronautlabs/windows';
let isAdmin = await isAdminUser();
```

## `taskList()`

List currently running processes.

```typescript
import { taskList } from '@astronautlabs/windows';

console.dir(await taskList());

/*
[
  {
    imageName: 'cmd.exe',
    pid: '12440',
    sessionName: 'Console',
    sessionNumber: '1',
    memUsage: '1,736 K'
  }
]
*/
```

## `taskKill()`

Kill a process by `PID`.

```typescript
import { taskKill } from '@astronautlabs/windows';
await taskKill(12345);
```

# Provenance

This library is based on the [`node-windows`](https://github.com/coreybutler/node-windows) package authored by 
[Corey Butler](https://github.com/coreybutler).