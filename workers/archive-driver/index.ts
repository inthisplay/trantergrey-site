type Environment = { ARCHIVE_WORKER_SECRET:string; ARCHIVE_ENDPOINT:string };
// D1 leases in the Pages endpoint serialize overlapping invocations. Each request
// awaits one bounded step; the cron continues saved progress without a browser.
export default {
  async scheduled(_controller:unknown,env:Environment) {
    const deadline=Date.now()+45000;
    for(let step=0;step<40 && Date.now()<deadline;step++) {
      const response=await fetch(env.ARCHIVE_ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${env.ARCHIVE_WORKER_SECRET}`},redirect:'manual',signal:AbortSignal.timeout(110000)});
      if(!response.ok)throw new Error(`Archive step returned HTTP ${response.status}`);
      const result=await response.json() as {worked?:boolean;busy?:boolean};
      if(!result.worked||result.busy)return;
    }
  },
};
