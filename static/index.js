$(function () {
  $("#xml")
    .bind("input propertychange", function () {
      sessionStorage.setItem("xml", $(this).val().replace(/↵/g, '\n'));
    })
    .val((sessionStorage.getItem("xml") || "").replace(/↵/g, '\n'));

  // require.config({ paths: { vs: "./static/monaco-editor/vs" } });
  // require(["vs/editor/editor.main"], function () {
  //   monaco.editor.create(document.getElementById("xml"), {
  //     language: "xml",
  //     theme: "vs-dark",
  //   });
  // });

  $("#run").click(function () {
    var xml = $("#xml").val();
    $("#xml").val(xml.replace(/↵/g, '\n'))
    // console.log(xml);

    const $xml = $(xml);

    const jobrels = [];
    const jobinfos = [];

    const excludeJobs = ["begin", "agentid", "timingplan", "end"];

    function loop($els, prevJobs = [], isSerial = false) {
      console.log($els, $els.length);
      let latestJobs = [];
      for (let i = 0; i < $els.length; i++) {
        const el = $els[i];
        const nodename = $.trim(
          (el.nodename || el.tagName || "").toLowerCase()
        );
        if (nodename.substr(0, 1) == "#") continue;
        if (nodename == "text") continue;
        if (!nodename || nodename == "name") continue;
        if (nodename == "serial") {
          const jobs = loop($(el).children(), prevJobs, true);
          latestJobs = isSerial ? jobs : latestJobs.concat(jobs);
          if (isSerial) prevJobs = jobs;
          continue;
        }
        if (nodename == "parallel") {
          const jobs = loop($(el).children(), prevJobs, false);
          if (isSerial) prevJobs = jobs;
          latestJobs = isSerial ? jobs : latestJobs.concat(jobs);
          continue;
        }
        if (excludeJobs.includes(nodename)) continue;

        const job = { name: `job_gen_${jobinfos.length}` };
        job.typename = nodename;

        jobinfos.push(job);

        const $attrs = $(el).children();
        for (let j = 0; j < $attrs.length; j++) {
          const $attr = $attrs[j];
          job.prevJobs = prevJobs;
          if ($attr.tagName)
            job[$attr.tagName.toLowerCase()] = $.trim($attr.innerHTML);
        }

        if (isSerial) {
          prevJobs = latestJobs = [job.name];
        } else {
          latestJobs.push(job.name);
        }
      }

      return latestJobs;
    }

    loop($xml);
    const props = "name,typename,progname,para,exppara,jobdesc,autorun,prevshell,nextshell,agentid,hostuser,datetype,period,timingplan,lean,ostr,errdelay,ignoreerr,maxnum,cyclecount,cycleinterval,cyclebreak,issplit,splitcount,priority,timeout,virresource,condition,successv,warnningv,errorv,failedv,monititle".split(
      ","
    );
    const infoCsv = `${props.join(",")}\n${jobinfos
      .map((job) => {
        return props
          .map((prop) => {
            let val = (typeof job[prop] == "undefined" ? "" : job[prop]);
            if (typeof val == 'string' && val.indexOf(',') >= 0) val = JSON.stringify(val);
            return val;
          })
          .join(",");
      })
      .join("\n")}
    `;

    $("#jobinfo").val(infoCsv);

    const relCsv = `jobname,prejob\n${jobinfos
      .reduce((array, job) => {
        const jobname = job.name;
        const prevJobs = job.prevJobs || [];
        prevJobs.forEach((prevjob) => {
          array.push(`${jobname},${prevjob}`);
        });
        // 排除依赖关系
        const leans = job.lean ? job.lean.split(",") : [];
        leans.forEach((prevjob) => {
          prevjob = $.trim(prevjob);
          if (!prevjob) return;
          array.push(`${jobname},${prevjob}`);
        });
        return array;
      }, [])
      .join("\n")}
    `;

    $("#jobrel").val(relCsv);
  });

  $("#btn-csv-info").click(function () {
    $("#run").click();
    exportCsv("taskctl_import_jobinfo.csv", $("#jobinfo").val());
  });
  $("#btn-csv-rela").click(function () {
    $("#run").click();
    exportCsv("taskctl_import_jobrela.csv", $("#jobrel").val());
  });
});

function exportCsv(name, data) {
  var blob = new Blob([data]);

  if (window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveBlob(blob, name);
  } else {
    var a = window.document.createElement("a");
    a.href = window.URL.createObjectURL(blob, {
      type: "text/csv",
    });
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
