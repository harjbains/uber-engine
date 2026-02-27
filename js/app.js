document.getElementById("current-date").innerText =
  new Date().toLocaleDateString();

async function testConnection() {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Supabase error:", error);
  } else {
    console.log("Supabase connected:", data);
  }
}

testConnection();
