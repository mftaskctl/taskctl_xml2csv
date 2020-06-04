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
    $("#xml").val(xml.replace(/↵/g, '\n'));

    const $tree = $(xml);
    // 作业信息
    const jobinfos = [];
    // 待排除不解析的节点名称
    const excludeNodeNames = ["begin", "end", "text"];
    // 作业属性
    const jobProps = "name,typename,progname,para,exppara,jobdesc,autorun,prevshell,nextshell,agentid,hostuser,datetype,period,timingplan,lean,ostr,errdelay,ignoreerr,maxnum,cyclecount,cycleinterval,cyclebreak,issplit,splitcount,priority,timeout,virresource,condition,successv,warnningv,errorv,failedv,monititle".split(
      ","
    );
    
    /**
     * 循环解析作业树
     * 
     * @param {ArrayLike<HTMLElement>} $els 节点集合
     * @param {Arrray<String>} prevJobs 依赖作业，用于平铺作业依赖关系
     * @param {Map<String, String>} prevProps 继承属性，用于平铺作业继承属性
     * @param {Boolean} isSerial 是否是串联组
     * 
     * @return {Arrray<String>} 返回执行组，最后的依赖作业
     */
    function loopParseJobTree($els, prevJobs = [], prevProps = {}, isSerial = false) {
      let latestJobs = [];

      // 过滤有效的作业节点
      // 并且处理组继承属性(单独循环原因，为了让组属性在解析组内作业之前解析)
      const $jobEls = $els.filter((i) => {
        const el = $els[i];
        const nodename = $.trim(
          (el.nodename || el.tagName || "").toLowerCase()
        );
        // 排除备注
        if (nodename.substr(0, 1) == "#") return false;
        // 无效节点，理论不存在此情况
        if (nodename == "") return false;
        // 排除不解析的
        if (excludeNodeNames.includes(nodename)) return false;

        // 处理组属性，用于平铺继承属性
        if (jobProps.includes(nodename)) {
          let val = $.trim(el.innerHTML);
          if (typeof val == 'string' && val.indexOf(',') >= 0) val = JSON.stringify(val);
          prevProps[nodename] = val;
          return false;
        }
        return true;
      });

      for (let i = 0; i < $jobEls.length; i++) {
        const el = $jobEls[i];
        const nodename = $.trim(
          (el.nodename || el.tagName || "").toLowerCase()
        );
        
        if (nodename == "serial") {
          const jobs = loopParseJobTree($(el).children(), prevJobs, {...prevProps}, true);
          latestJobs = isSerial ? jobs : latestJobs.concat(jobs);
          if (isSerial) prevJobs = jobs;
          continue;
        }

        if (nodename == "parallel") {
          const jobs = loopParseJobTree($(el).children(), prevJobs, {...prevProps}, false);
          if (isSerial) prevJobs = jobs;
          latestJobs = isSerial ? jobs : latestJobs.concat(jobs);
          continue;
        }

        const job = { name: `job_gen_${jobinfos.length}` };
        jobinfos.push(job);

        // 赋值继承属性
        Object.keys(prevProps).forEach(prop => {
          job[prop] = prevProps[prop];
        });

        // 处理自身属性
        job.typename = nodename;
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

    loopParseJobTree($tree);
   
    const infoCsv = `${jobProps.join(",")}\n${jobinfos
      .map((job) => {
        return jobProps
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
