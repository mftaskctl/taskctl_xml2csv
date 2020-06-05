/**
 * 获取 taskctl 与 control-m 的属性映射关系
 * @return {Array<{tasckctlProp: String, thirdProp: String, Dict: Map}>}
 */
function getTaskctlAndControlMPropMap() {
  const csv = `
    name,11_JOBNAME,,作业名称,
    typename,13_TASKTYPE,,作业类型,
    progname,14_CMDLINE,,程序名称,需要匹配列8后替换为列9的值
    para,,,参数,
    exppara,,,环境参数,
    jobdesc,12_DESCRIPTION,,节点描述,
    autorun,46_CONFIRM,0=N;1=Y,自动运行,
    prevshell,,,前置shell,
    nextshell,,,后置shell,
    agentid,2_DATACENTER,,代理服务器ID,
    hostuser,,,主机(远程)用户,
    datetype,,,计划判断日期变量,
    period,,,执行计划,
    timingplan,,,定时间隔,
    lean,,,依赖信息,
    ostr,,,互斥信息,
    errdelay,38_INTERVAL,00001M=60S;,作业错误重试延时,源是分钟为单位，转为秒
    ignoreerr,37_MAXRERUN,0=N;1~99=Y,是否忽略错误,ignoreerr=N时，errdelay和maxnum不起作用
    maxnum,37_MAXRERUN,,作业错误重试最大次数,
    cyclecount,34_CYCLIC,0=N;1=Y,循环次数,
    cycleinterval,42_CYCLIC_TOLERANCE,*60,循环间隔,
    cyclebreak,,,循环退出条件,
    issplit,,,是否分片,
    splitcount,,,分片数,
    priority,,,优先级,
    timeout,,,作业超时（秒）,
    virresource,,,虚拟资源消耗值,
    condition,,,自定义策略,
    successv,,,运行成功返回信息,
    warnningv,,,运行警告(忽略)返回信息,
    errorv,,,运行错误返回信息,
    failedv,,,运行失败返回信息,
    monititle,,,标签监控,
  `;

  return csv
    .split("\n")
    .slice(1)
    .reduce((props, str) => {
      const array = $.trim(str).split(",");
      if (array.length < 3) return props;
      const [tasckctlProp, thirdProp, v3] = array.map((d) => $.trim(d));
      if (thirdProp.length == 0) return props;
      const propMap = { tasckctlProp, thirdProp, dict: undefined };
      props.push(propMap);
      if (v3.length > 0) {
        propMap.dict = v3.split(";").reduce((dict, str) => {
          const [k, v = ""] = str.split("=").map((d) => $.trim(d));
          if (k.length == 0 || v.length == 0) return dict;
          dict[k] = v;
          return dict;
        }, {});
      }
      return props;
    }, []);
}

$(function () {
  $("#input")
    .bind("input propertychange", function () {
      sessionStorage.setItem("input", $(this).val().replace(/↵/g, "\n"));
    })
    .val((sessionStorage.getItem("input") || "").replace(/↵/g, "\n"));

  const csvSplitterRegx = /,(?=([^\"]*\"[^\"]*\")*[^\"]*$)/g;
  const csvSplitter = "[$,$]";

  const jobProps = "name,typename,progname,para,exppara,jobdesc,autorun,prevshell,nextshell,agentid,hostuser,datetype,period,timingplan,lean,ostr,errdelay,ignoreerr,maxnum,cyclecount,cycleinterval,cyclebreak,issplit,splitcount,priority,timeout,virresource,condition,successv,warnningv,errorv,failedv,monititle".split(
    ","
  );

  const jobpropMap = getTaskctlAndControlMPropMap();

  // 全局变量
  const globalVars = [[/\%\%\$ODATE/g, "$(ODATE)"]];

  $("#run").click(function () {
    const jobinfos = [];
    const jobrelas = [];

    let csv = $("#input").val();
    // 处理tab
    csv = csv.replace(/\t/g, "");
    // 多个空格，替换成一个空格
    // csv = csv.replace(/\s+/g, ' ');

    // 处理全局变量
    csv = globalVars.reduce((csv, [k, v]) => csv.replace(k, v), csv);

    // 处理 csv 字符串内容包含","
    csv = csv.replace(csvSplitterRegx, csvSplitter);

    const recordRows = csv.split("\n");
    const propKeys = recordRows[0]
      .split(csvSplitter)
      .map((key, index) => `${index + 1}_${$.trim(key)}`);

    for (let i = 1; i < recordRows.length; i++) {
      const recordRow = recordRows[i];
      if ($.trim(recordRow).length == 0) continue;

      const props = recordRow.split(csvSplitter);
      const record = props.reduce((record, val, index) => {
        const key =
          typeof propKeys[index] == "string" ? propKeys[index] : `${index}_GK`;
        record[key] = $.trim(val);
        return record;
      }, {});
      const jobname = record["11_JOBNAME"];
      let prev = record["47_INCOND"];
      let next = record["53_OUTCOND"];

      if (typeof prev == "string" && prev.length > 0) {
        if (prev.includes(",")) prev = JSON.parse(prev);
        prev.split(",").forEach((prevname) => {
          const rela = `${jobname},${prevname}`;
          if (jobrelas.includes(rela)) return;
          jobrelas.push(rela);
        });
      }

      if (typeof next == "string" && next.length > 0) {
        if (next.includes(",")) next = JSON.parse(next);
        next.split(",").forEach((nextname) => {
          const rela = `${nextname},${jobname}`;
          if (jobrelas.includes(rela)) return;
          jobrelas.push(rela);
        });
      }
      record["14_CMDLINE"] = record["14_CMDLINE"].replace(
        record["8_NAME"],
        record["9_VALUE"]
      );

      record["14_CMDLINE"] = record["14_CMDLINE"].replace(
        record["8_NAME"].replace("%%\\", "%%"),
        record["9_VALUE"]
      );

      record["14_CMDLINE"] = record["14_CMDLINE"].replace(
        record["8_NAME"],
        record["9_VALUE"].replace("%%\\", "%%")
      );

      if (record["14_CMDLINE"].includes("%%")) {
        console.error(i, record["8_NAME"], record["14_CMDLINE"]);
      }

      const job = { ...record, name: jobname };
      const jobIndex = jobinfos.findIndex((d) => d.name == job.name);
      if (jobIndex >= 0) {
        console.error(i, job, jobIndex, jobinfos[jobIndex]);

        // 设置保留开始，还是保留之后
        const isKeepBefore = true;

        // 如果保留最开始的, 不做任何处理
        if (isKeepBefore) continue;

        // 如果保留后面数据
        const prevJob = jobinfos.splice(jobIndex, 1);
        const prev = prevJob["47_INCOND"];
        const next = prevJob["53_OUTCOND"];
        if (typeof prev == "string" && prev.length > 0) {
          if (prev.includes(",")) prev = JSON.parse(prev);
          prev.split(",").forEach((prevname) => {
            const rela = `${jobname},${prevname}`;
            const index = jobrelas.indexOf(rela);
            jobrelas.splice(index, 1);
          });
        }
  
        if (typeof next == "string" && next.length > 0) {
          if (next.includes(",")) next = JSON.parse(next);
          next.split(",").forEach((nextname) => {
            const rela = `${nextname},${jobname}`;
            const index = jobrelas.indexOf(rela);
            jobrelas.splice(index, 1);
          });
        }

      }
      jobinfos.push(job);
      for (const { tasckctlProp, thirdProp, dict } of jobpropMap) {
        let val = record[thirdProp];
        if (typeof val != "string" && val.length == 0) continue;
        if (dict) val = typeof dict[val] != "undefined" ? dict[val] : val;
        job[tasckctlProp] = val;
      }

      // 兼容处理问题
      if (job.typename == 'Command') {
        job.typename = 'perl';
        job.progname = job.progname.replace('perl', '');
      }
      job.progname = $.trim(job.progname.replace(/\/.\//g, '').replace(/\s/g, ' '));
      job.jobdesc = $.trim(job.jobdesc.replace(/\s/g, ' '));

    }

    console.log(jobinfos);

    const infoCsv = `${jobProps.join(",")}\n${jobinfos
      .map((job) => {
        return jobProps
          .map((prop) => {
            let val = $.trim(typeof job[prop] == "undefined" ? "" : job[prop]);
            if (
              typeof val == "string" &&
              val.indexOf(",") >= 0 &&
              val.substr(0, 1) != '"'
            )
              val = JSON.stringify(val);
            return val;
          })
          .join(",");
      })
      .join("\n")}
    `;
    $("#jobinfo").val(infoCsv);

    jobrelas.unshift("jobname,prejob");
    const relCsv = jobrelas.join("\n");
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
